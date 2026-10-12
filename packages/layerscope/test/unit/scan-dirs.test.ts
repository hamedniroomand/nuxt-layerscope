import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join, relative } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { collectFiles, isCheckedFile } from '#src/analyze/files.ts';
import { loadNuxtKit } from '#src/nuxt/kit.ts';
import { deriveDirectories } from '#src/nuxt/layer-factory.ts';
import { resolveLayers } from '#src/nuxt/layers.ts';
import { createOwnerLookup } from '#src/nuxt/owner.ts';
import { NUXT3_ROOT, NUXT4_ROOT } from '#test/fixtures.ts';

interface Case {
  /** The layout: a Nuxt install of the matching major version and the `nuxt.config` body. */
  name: string;
  nuxt: string;
  config: string;
  /** Path from the project root, and whether `check` and `unused` read the file. */
  rows: [file: string, scanned: boolean][];
}

const CASES: Case[] = [
  {
    name: 'Nuxt 4 (srcDir app/)',
    nuxt: NUXT4_ROOT,
    config: '{}',
    rows: [
      ['app/modules/x.ts', true],
      ['server/modules/x.ts', true],
      ['shared/modules/x.ts', true],
      ['app/public/x.ts', true],
      ['app/components/modules/x.ts', true],
      ['app/layerscope.config.ts', true],
      ['app/node_modules/pkg/x.ts', false],
      ['modules/x.ts', false],
      ['public/x.ts', false],
      ['layerscope.config.ts', false],
    ],
  },
  {
    name: 'Nuxt 4 with a custom dir.modules',
    nuxt: NUXT4_ROOT,
    config: "{ dir: { modules: 'local' } }",
    rows: [
      ['app/modules/x.ts', true],
      ['local/x.ts', false],
    ],
  },
  {
    name: 'Nuxt 3 (srcDir src/)',
    nuxt: NUXT3_ROOT,
    config: "{ srcDir: 'src' }",
    rows: [
      ['src/modules/x.ts', false],
      ['src/public/x.ts', false],
      ['src/components/modules/x.ts', true],
      // Nuxt 3 resolves serverDir from srcDir and the shared dir from the root.
      ['src/server/modules/x.ts', true],
      ['shared/modules/x.ts', true],
      ['src/layerscope.config.ts', true],
      ['modules/x.ts', false],
      ['public/x.ts', false],
    ],
  },
  {
    name: 'Nuxt 3 (srcDir is the root)',
    nuxt: NUXT3_ROOT,
    config: '{}',
    rows: [
      ['modules/x.ts', false],
      ['public/x.ts', false],
      ['layerscope.config.ts', false],
      ['server/modules/x.ts', true],
      ['shared/modules/x.ts', true],
      ['components/modules/x.ts', true],
      ['app/layerscope.config.ts', true],
      ['node_modules/pkg/x.ts', false],
    ],
  },
  {
    name: 'Nuxt 3 with a custom dir.modules',
    nuxt: NUXT3_ROOT,
    config: "{ dir: { modules: 'local' } }",
    rows: [
      ['local/x.ts', false],
      ['modules/x.ts', true],
    ],
  },
];

/** A project with real files, and the `node_modules` of a fixture so that Nuxt and kit load. */
function createProject(item: Case): string {
  // The project is a child dir, so that a `../api` dir of a row stays inside the temp dir.
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-scan-')));
  const root = join(base, 'project');
  mkdirSync(root);
  symlinkSync(join(item.nuxt, 'node_modules'), join(root, 'node_modules'));
  writeFileSync(join(root, 'nuxt.config.ts'), `export default ${item.config};\n`);
  for (const [file] of item.rows) {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'export const x = 1;\n');
  }
  // Nuxt 4 uses app/ as srcDir only when the dir exists.
  mkdirSync(join(root, 'app'), { recursive: true });
  return root;
}

describe.each(CASES)('scanned files: $name', item => {
  it('gives the same answer in collectFiles and isCheckedFile for every path', async () => {
    const root = createProject(item);
    const layers = await resolveLayers(root, {});
    const layer = layers[0];
    const collected = await collectFiles(layers, createOwnerLookup(layers), []);
    const actual = item.rows.map(([file]) => {
      const path = join(realpathSync(dirname(join(root, file))), file.split('/').pop() ?? '');
      return {
        file,
        collected: collected.has(path),
        checked: isCheckedFile(path, layer, []),
      };
    });
    expect(actual).toEqual(
      item.rows.map(([file, scanned]) => ({ file, collected: scanned, checked: scanned })),
    );
  });
});

describe('deriveDirectories for the modules and public dirs', () => {
  it.each(CASES)('gives the paths of kit getLayerDirectories: $name', async item => {
    const root = createProject(item);
    const kit = await loadNuxtKit(root);
    const options = await kit?.loadNuxtConfig({ cwd: root });
    const real = options === undefined ? undefined : kit?.getLayerDirectories?.({ options });
    if (options === undefined || real === undefined) {
      throw new Error('kit with getLayerDirectories expected');
    }
    for (const [index, layer] of options._layers.entries()) {
      const derived = deriveDirectories(layer, index, options);
      const strip = (path: string | undefined): string | undefined => path?.replace(/\/$/u, '');
      expect(derived.modules, relative(root, layer.cwd)).toBe(strip(real[index].modules));
      expect(derived.public, relative(root, layer.cwd)).toBe(strip(real[index].public));
    }
  });
});

describe('a serverDir outside the layer root', () => {
  it('keeps the dirs named modules and public, and the config name', async () => {
    const item: Case = {
      name: 'outside',
      nuxt: NUXT4_ROOT,
      config: "{ serverDir: '../api' }",
      rows: [
        ['../api/modules/x.ts', true],
        ['../api/public/x.ts', true],
        ['../api/layerscope.config.ts', true],
      ],
    };
    const root = createProject(item);
    const [layer] = await resolveLayers(root, {});
    // Only `isCheckedFile` is asserted: `collectFiles` drops files that no layer root holds
    // (`createOwnerLookup`), which is older than this rule.
    for (const [file] of item.rows) {
      expect(
        isCheckedFile(join(realpathSync(join(root, '../api')), file.slice(7)), layer, []),
      ).toBe(true);
    }
  });
});
