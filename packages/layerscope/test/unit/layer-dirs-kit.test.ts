import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { collectFiles, isCheckedFile } from '#src/analyze/files.ts';
import { loadNuxtKit } from '#src/nuxt/kit.ts';
import { layersFromOptions } from '#src/nuxt/layer-factory.ts';
import { layersForModule, resolveLayers } from '#src/nuxt/layers.ts';
import { createOwnerLookup } from '#src/nuxt/owner.ts';
import { NUXT3_ROOT, NUXT4_ROOT } from '#test/fixtures.ts';

/** `@nuxt/kit` as the Nuxt install of a fixture uses it: next to `nuxt` in the package store. */
function kitOf(fixture: string): string {
  return realpathSync(join(realpathSync(join(fixture, 'node_modules/nuxt')), '../@nuxt/kit'));
}

type Rows = [file: string, scanned: boolean][];

/** Nuxt 3: the dirs of the extended layer `base` are in its root, which is its srcDir. */
const ROWS_NUXT3: Rows = [
  ['base/modules/x.ts', false],
  ['base/public/x.ts', false],
  ['base/components/modules/x.ts', true],
  ['public/x.ts', false],
];

/** Nuxt 4: the dirs are in the root of `base`, outside its srcDir `app/`. */
const ROWS_NUXT4: Rows = [
  ['base/modules/x.ts', false],
  ['base/public/x.ts', false],
  ['base/app/modules/x.ts', true],
  ['base/app/public/x.ts', true],
  ['base/app/components/modules/x.ts', true],
  ['public/x.ts', false],
];

/**
 * A project that extends `./base`, with the Nuxt and kit of the given fixture, so the kit that
 * loads is the one that the fixture's Nuxt major version uses (the in-repo fixtures would find
 * the kit 4 of this package first).
 */
function createExtendedProject(fixture: string, srcDir: string, rows: Rows): string {
  const root = join(realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-ext-'))), 'project');
  mkdirSync(join(root, 'node_modules/@nuxt'), { recursive: true });
  symlinkSync(realpathSync(join(fixture, 'node_modules/nuxt')), join(root, 'node_modules/nuxt'));
  symlinkSync(realpathSync(join(fixture, 'node_modules/vue')), join(root, 'node_modules/vue'));
  symlinkSync(kitOf(fixture), join(root, 'node_modules/@nuxt/kit'));
  writeFileSync(join(root, 'nuxt.config.ts'), "export default { extends: ['./base'] };\n");
  mkdirSync(join(root, 'base'), { recursive: true });
  writeFileSync(join(root, 'base/nuxt.config.ts'), `export default { srcDir: '${srcDir}' };\n`);
  for (const [file] of rows) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), 'export const x = 1;\n');
  }
  return root;
}

const PROJECTS = [
  { name: 'Nuxt 3 with kit 3.21', fixture: NUXT3_ROOT, srcDir: '.', rows: ROWS_NUXT3 },
  { name: 'Nuxt 4 with kit 4', fixture: NUXT4_ROOT, srcDir: 'app', rows: ROWS_NUXT4 },
];

describe.each(PROJECTS)('an extended layer: $name', ({ fixture, srcDir, rows }) => {
  it('skips only the modules and public dirs of the layer, in both functions', async () => {
    const root = createExtendedProject(fixture, srcDir, rows);
    const layers = await resolveLayers(root, {});
    const collected = await collectFiles(layers, createOwnerLookup(layers), []);
    const ownerOf = createOwnerLookup(layers);
    for (const [file, scanned] of rows) {
      const path = join(realpathSync(dirname(join(root, file))), file.split('/').pop() ?? '');
      const layer = ownerOf(path);
      expect(layer && isCheckedFile(path, layer, []), file).toBe(scanned);
      expect(collected.has(path), file).toBe(scanned);
    }
  });

  it('gives the registry writer the same layers as the CLI', async () => {
    const root = createExtendedProject(fixture, srcDir, rows);
    const kit = await loadNuxtKit(root);
    const options = await kit?.loadNuxtConfig({ cwd: root });
    if (options === undefined) {
      throw new Error('kit expected');
    }
    expect(await layersForModule(root, options)).toEqual(await resolveLayers(root, {}));
  });
});

describe('the dirs of an extended layer in Nuxt 3', () => {
  it('are the dirs of the layer, as kit 3.21 gives them', async () => {
    const root = createExtendedProject(NUXT3_ROOT, '.', ROWS_NUXT3);
    const layers = await resolveLayers(root, {});
    const base = layers.find(layer => layer.name === 'base');
    expect(base?.publicDir).toBe(join(base?.root ?? '', 'public'));
    expect(base?.modulesDir).toBe(join(base?.root ?? '', 'modules'));
  });
});

describe('layersForModule without a kit that loads', () => {
  it('uses the derived dirs, not an empty list', async () => {
    const root = createExtendedProject(NUXT3_ROOT, '.', ROWS_NUXT3);
    const kit = await loadNuxtKit(root);
    const options = await kit?.loadNuxtConfig({ cwd: root });
    if (options === undefined) {
      throw new Error('kit expected');
    }
    // A dir with no node_modules above it: `loadNuxtKit` finds no kit.
    const bare = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-bare-')));
    const layers = await layersForModule(bare, options);
    expect(layers.map(layer => layer.name)).toEqual(['root', 'base']);
    expect(layers).toEqual(layersFromOptions(null, options));
    expect(layers[1].modulesDir).toBe(join(layers[1].root, 'modules'));
  });
});
