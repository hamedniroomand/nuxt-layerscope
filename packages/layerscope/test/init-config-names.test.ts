import { existsSync } from 'node:fs';

import { join, relative } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, EXIT_ERROR } from '#src/cli.ts';
import { noNuxtIgnore } from '#test/factories.ts';

import { init, project, read, removeProjects } from './init-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
  removeProjects();
});

const MJS = 'export default { layers: { root: { allow: [] } } };\n';

/** The registry of a Nuxt run whose `nuxt.config` set `preset`, which `init` refuses to copy. */
const REGISTRY = {
  version: 1,
  generator: { name: 'test', version: '0', nuxt: '4' },
  layers: [],
  components: [],
  shadowedComponents: [],
  shadowedLayouts: [],
  shadowedMiddleware: [],
  shadowedPages: [],
  shadowedImports: [],
  componentDirs: [],
  importDirs: [],
  nuxtIgnore: noNuxtIgnore(),
  imports: { app: [], server: [], shared: [] },
  config: { preset: 'layered' },
};

function withRegistry(files: [string, string][]): string {
  return project({
    files: [['.nuxt/layerscope/registry.json', JSON.stringify(REGISTRY)], ...files],
  });
}

const shown = (root: string, name: string): string => relative(process.cwd(), join(root, name));

describe('init with a layerscope.config.mjs', () => {
  it('without the file, the nuxt.config keys stop init (the guard sees no config)', async () => {
    const { code, stderr } = await init(withRegistry([]), '--dry-run', '--source', 'types');
    expect(code).toBe(EXIT_ERROR);
    expect(stderr).toContain('"preset" is set in the "layerscope" key of nuxt.config');
  });

  it('counts the file for the guard, so --dry-run runs and writes nothing', async () => {
    const root = withRegistry([['layerscope.config.mjs', MJS]]);
    const { code, stderr } = await init(root, '--dry-run', '--source', 'types');
    expect(stderr).not.toContain('is set in the');
    expect(code).toBe(EXIT_CLEAN);
    expect(read(root, 'layerscope.config.mjs')).toBe(MJS);
    expect(existsSync(join(root, 'layerscope.config.ts'))).toBe(false);
  });

  it('stops with the already exists text, which names --dry-run first', async () => {
    const root = project({ files: [['layerscope.config.mjs', MJS]] });
    const { code, stderr } = await init(root);
    expect(code).toBe(EXIT_ERROR);
    expect(stderr).toContain(
      `${shown(root, 'layerscope.config.mjs')} already exists. To keep it, run with --dry-run and copy what you need. To write it again, run with --force. --force keeps its keys, and the expose, path and source of each layer.`,
    );
  });

  it('replaces the file with --force and writes no second config', async () => {
    const root = project({ files: [['layerscope.config.mjs', MJS]] });
    const { code } = await init(root, '--force');
    expect(code).toBe(EXIT_CLEAN);
    expect(read(root, 'layerscope.config.mjs')).toContain(
      "import { defineConfig } from 'nuxt-layerscope'",
    );
    expect(existsSync(join(root, 'layerscope.config.ts'))).toBe(false);
  });

  it('writes the file that --config names and keeps the .mjs file', async () => {
    const root = project({ files: [['layerscope.config.mjs', MJS]] });
    const { code } = await init(root, '--config', 'other.config.ts');
    expect(code).toBe(EXIT_CLEAN);
    expect(read(root, 'other.config.ts')).toContain('defineConfig');
    expect(read(root, 'layerscope.config.mjs')).toBe(MJS);
  });
});

describe('init with a layerscope.config.ts, and with a baseline', () => {
  it('replaces the .ts file with --force, as before', async () => {
    const root = project({ files: [['layerscope.config.ts', 'export default {};\n']] });
    expect((await init(root, '--force')).code).toBe(EXIT_CLEAN);
    expect(read(root, 'layerscope.config.ts')).toContain('defineConfig');
  });

  it('gives the same text for an existing baseline', async () => {
    const root = project({ files: [['layerscope-baseline.json', '{}\n']] });
    const { code, stderr } = await init(
      root,
      '--baseline',
      '--config',
      join(root, 'new.config.ts'),
    );
    expect(code).toBe(EXIT_ERROR);
    expect(stderr).toContain(
      `${shown(root, 'layerscope-baseline.json')} already exists. To keep it, run with --dry-run and copy what you need. To write it again, run with --force.`,
    );
  });
});
