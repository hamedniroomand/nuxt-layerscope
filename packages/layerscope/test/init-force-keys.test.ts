import { existsSync } from 'node:fs';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, EXIT_ERROR, run } from '#src/cli.ts';
import { loadConfig } from '#src/config/load.ts';
import { renderValue } from '#src/init/render.ts';

import { init, project, read, removeProjects } from './init-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
  removeProjects();
});

const KEPT = {
  preset: { name: 'features', base: ['root'] },
  baseline: 'ci/base.json',
  rules: { 'layer-cycle': 'warn' },
  ignore: ['**/*.gen.ts'],
  globals: ["it's", 'a\nb'],
  typeImports: 'ignore',
  custom: { count: 2, on: true, none: null, 'two words': [] },
};

const configWith = (layers: object): string =>
  `export default ${JSON.stringify({ ...KEPT, layers })};\n`;

describe('init --force and the keys of the old config', () => {
  it('keeps every key other than layers, with the same values, and writes the new layers', async () => {
    const root = project({
      files: [['layerscope.config.mjs', configWith({ gone: { allow: ['nowhere'] } })]],
    });
    const { code, stderr } = await init(root, '--force');
    expect(code).toBe(EXIT_CLEAN);
    expect(stderr).not.toContain('gone');
    const { layers, ...rest } = await loadConfig(root, 'layerscope.config.mjs');
    expect(rest).toEqual(KEPT);
    expect(Object.keys(layers ?? {})).not.toContain('gone');
    expect(Object.keys(layers ?? {})).not.toHaveLength(0);
  });

  it('prints the kept keys with --force --dry-run, and writes nothing', async () => {
    const old = configWith({});
    const root = project({ files: [['layerscope.config.mjs', old]] });
    const { code, stdout } = await init(root, '--force', '--dry-run');
    expect(code).toBe(EXIT_CLEAN);
    expect(stdout).toContain("  baseline: 'ci/base.json',");
    expect(read(root, 'layerscope.config.mjs')).toBe(old);
  });
});

describe('init --force and an old config that it cannot keep', () => {
  it('replaces a config that does not load, and says that it keeps none of its keys', async () => {
    const root = project({ files: [['layerscope.config.mjs', 'export default 42;\n']] });
    const { code, stderr } = await init(root, '--force');
    expect(code).toBe(EXIT_CLEAN);
    expect(read(root, 'layerscope.config.mjs')).toContain('defineConfig');
    expect(stderr).toMatch(
      /The new config keeps none of the keys of the old config, because it did not load: \S*layerscope\.config\.mjs must default-export a config object\n/u,
    );
  });

  it('stops, and writes nothing, when a key holds a value that is not plain data', async () => {
    const old = 'export default { baseline: "ci/base.json", pattern: /a/u };\n';
    const root = project({ files: [['layerscope.config.mjs', old]] });
    const { code, stderr } = await init(root, '--force');
    expect(code).toBe(EXIT_ERROR);
    expect(stderr).toContain(
      'layerscope.config.mjs: its value is not plain data, for example a function or a RegExp. Remove the key from that file and run init again, or write the new config by hand.',
    );
    expect(stderr).toContain('Cannot keep the key pattern of ');
    expect(read(root, 'layerscope.config.mjs')).toBe(old);
  });

  it('reads such a config without --force as before: --dry-run keeps no key and does not stop', async () => {
    const old = 'export default { baseline: "ci/base.json", pattern: /a/u };\n';
    const root = project({ files: [['layerscope.config.mjs', old]] });
    const { code, stdout } = await init(root, '--dry-run');
    expect(code).toBe(EXIT_CLEAN);
    expect(stdout).not.toContain('ci/base.json');
  });
});

/** Runs a layerscope command with its output kept from the test log, and gives its exit code. */
async function cli(...args: string[]): Promise<number> {
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const code = await run(['node', 'layerscope', ...args]);
  vi.restoreAllMocks();
  return code;
}

describe('init --force, its analysis and its baseline', () => {
  it('writes the baseline to the file that the kept baseline key names', async () => {
    const root = project({
      files: [
        ['layerscope.config.mjs', "export default { baseline: 'ci/base.json' };\n"],
        ['ci/.keep', ''],
      ],
    });
    expect((await init(root, '--force', '--baseline')).code).toBe(EXIT_CLEAN);
    expect(existsSync(join(root, 'ci/base.json'))).toBe(true);
    expect(existsSync(join(root, 'layerscope-baseline.json'))).toBe(false);
  });

  it('uses the kept rules, so check --strict-baseline passes right after init', async () => {
    const root = project({
      files: [
        ['layerscope.config.mjs', "export default { rules: { 'unresolved-reference': 'off' } };\n"],
        ['app/utils/broken.ts', 'export const broken = () => missingThing();\n'],
      ],
    });
    expect((await init(root, '--force', '--baseline')).code).toBe(EXIT_CLEAN);
    expect(await cli('check', root, '--strict-baseline')).toBe(EXIT_CLEAN);
  });

  it('uses the kept ignore, so an ignored file gives no edge to the allow map', async () => {
    const root = project({
      files: [
        ['layerscope.config.mjs', "export default { ignore: ['**/uses-admin.ts'] };\n"],
        ['nuxt.config.ts', "export default defineNuxtConfig({ extends: ['./layers/admin'] });\n"],
        ['layers/admin/nuxt.config.ts', 'export default defineNuxtConfig({});\n'],
        ['layers/admin/app/utils/useAdmin.ts', 'export const useAdmin = () => 1;\n'],
        [
          'app/utils/uses-admin.ts',
          "import { useAdmin } from '../../layers/admin/app/utils/useAdmin';\nexport const x = useAdmin;\n",
        ],
      ],
    });
    expect((await init(root, '--force')).code).toBe(EXIT_CLEAN);
    const { layers } = await loadConfig(root, 'layerscope.config.mjs');
    expect(layers?.admin).toBeDefined();
    expect(layers?.root).toEqual({ allow: [] });
  });
});

/** The admin layer has a file that its `expose` list does not name, and root uses that file. */
const HIDDEN: [string, string][] = [
  ['nuxt.config.ts', "export default defineNuxtConfig({ extends: ['./layers/admin'] });\n"],
  ['layers/admin/nuxt.config.ts', 'export default defineNuxtConfig({});\n'],
  ['layers/admin/app/utils/hidden.ts', 'export const useHidden = () => 1;\n'],
  [
    'app/utils/uses-hidden.ts',
    "import { useHidden } from '../../layers/admin/app/utils/hidden';\nexport const x = useHidden;\n",
  ],
];

describe('init --force and the expose, path and source keys of the layers', () => {
  it('keeps them for a layer that path names, and uses them in the analysis and the baseline', async () => {
    const old =
      "export default { layers: { back: { path: 'layers/admin', expose: ['useAdmin'] }, gone: { allow: [] } } };\n";
    const root = project({ files: [...HIDDEN, ['layerscope.config.mjs', old]] });
    const { code, stderr } = await init(root, '--force', '--baseline');
    expect(code).toBe(EXIT_CLEAN);
    expect(stderr).not.toContain('gone');
    const { layers } = await loadConfig(root, 'layerscope.config.mjs');
    expect(Object.keys(layers ?? {}).toSorted()).toEqual(['back', 'root']);
    expect(layers?.back).toEqual({ expose: ['useAdmin'], path: 'layers/admin', allow: [] });
    expect(read(root, 'layerscope-baseline.json')).toContain('"layer-internal"');
    expect(await cli('check', root, '--strict-baseline')).toBe(EXIT_CLEAN);
  });

  it.each([
    ['expose', "{ expose: ['useA'] }", 'Unknown layer "gone" in config. Known layers: '],
    ['path', "{ path: 'layers/none' }", 'layers.gone.path: no Nuxt layer at '],
    ['source', "{ source: 'github:org/none' }", 'layers.gone.source: no layer cloned from '],
  ])(
    'stops, and writes nothing, when it does not find a layer that has %s',
    async (_key, rule, message) => {
      const old = `export default { layers: { gone: ${rule} } };\n`;
      const root = project({ files: [...HIDDEN, ['layerscope.config.mjs', old]] });
      const { code, stderr } = await init(root, '--force', '--baseline');
      expect(code).toBe(EXIT_ERROR);
      expect(stderr).toContain(message);
      expect(read(root, 'layerscope.config.mjs')).toBe(old);
      expect(existsSync(join(root, 'layerscope-baseline.json'))).toBe(false);
    },
  );
});

describe('renderValue', () => {
  it('writes strings, numbers, booleans, null, arrays and objects as source code', () => {
    const value = { 'a-b': ["it's", 'x\ny'], n: 1.5, t: false, z: null, e: {}, l: [] };
    const source = renderValue(value, 'key', 'file');
    expect(source).toBe(
      [
        '{',
        "  'a-b': [",
        String.raw`    'it\'s',`,
        String.raw`    'x\ny',`,
        '  ],',
        '  n: 1.5,',
        '  t: false,',
        '  z: null,',
        '  e: {},',
        '  l: [],',
        '}',
      ].join('\n'),
    );
  });

  it('names the path of a value that is not plain data', () => {
    for (const bad of [/a/u, new Date(0), (): number => 1, new (class Box {})()]) {
      expect(() => renderValue({ list: [1, { bad }] }, 'custom', 'my.config.ts')).toThrow(
        'Cannot keep the key custom.list[1].bad of my.config.ts: its value is not plain data, for example a function or a RegExp. Remove the key from that file and run init again, or write the new config by hand.',
      );
    }
  });
});
