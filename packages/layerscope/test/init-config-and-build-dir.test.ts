import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, run } from '#src/cli.ts';

import {
  init,
  project,
  read,
  readFrom,
  removeProjects,
  tempFolder,
  write,
} from './init-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
  removeProjects();
});

describe('init and the Nuxt build directory, first run', () => {
  it('reads a custom buildDir of nuxt.config when only that folder has data', async () => {
    const root = project({ nuxtBuildDir: '.build', dataIn: ['.build'] });
    const { code, stderr } = await init(root, '--dry-run', '--verbose');
    expect(code).toBe(EXIT_CLEAN);
    expect(stderr).toContain(readFrom(root, '.build'));
  });

  it('reads the custom folder, not an old .nuxt that also has data', async () => {
    const root = project({ nuxtBuildDir: '.build', dataIn: ['.nuxt', '.build'] });
    const { stderr } = await init(root, '--dry-run', '--verbose');
    expect(stderr).toContain(readFrom(root, '.build'));
    expect(stderr).not.toContain(readFrom(root, '.nuxt'));
  });

  it('writes buildDir into the new config, and check reads the same folder', async () => {
    const root = project({ nuxtBuildDir: '.build', dataIn: ['.build'] });
    expect((await init(root)).code).toBe(EXIT_CLEAN);
    expect(read(root, 'layerscope.config.ts')).toContain("  buildDir: '.build',");
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(await run(['node', 'layerscope', 'check', root])).toBe(EXIT_CLEAN);
  });
});

describe('init and the Nuxt build directory, the path in the new config', () => {
  it('keeps an absolute buildDir outside the root absolute, not a ../ path', async () => {
    const outside = tempFolder();
    write(outside, 'types/imports.d.ts', 'export {}\n');
    write(outside, 'components.d.ts', '\n');
    const root = project({ nuxtBuildDir: outside, dataIn: [] });
    const { code } = await init(root, '--verbose');
    expect(code).toBe(EXIT_CLEAN);
    const config = read(root, 'layerscope.config.ts');
    expect(config).toContain(`  buildDir: '${outside}',`);
    expect(config).not.toContain('../');
  });

  it('keeps a folder inside the root that starts with two dots relative', async () => {
    const root = project({ nuxtBuildDir: '..generated', dataIn: ['..generated'] });
    const { code } = await init(root);
    expect(code).toBe(EXIT_CLEAN);
    expect(read(root, 'layerscope.config.ts')).toContain("  buildDir: '..generated',");
  });

  it('writes no buildDir line for the default folder', async () => {
    const root = project();
    expect((await init(root)).code).toBe(EXIT_CLEAN);
    expect(read(root, 'layerscope.config.ts')).not.toContain('buildDir');
  });

  it('reads .nuxt when it already exists and nuxt.config sets no buildDir', async () => {
    // Without the `_prepare` override, kit moves the folder to node_modules/.cache/nuxt/.nuxt here.
    const root = project({ dataIn: ['.nuxt'] });
    const { code, stderr } = await init(root, '--dry-run', '--verbose');
    expect(code).toBe(EXIT_CLEAN);
    expect(stderr).toContain(readFrom(root, '.nuxt'));
  });
});

const EXISTING = "export default { buildDir: '.cache-x' };\n";

describe('init and the Nuxt build directory, with an existing config', () => {
  it('reads the buildDir of the existing config with --force, and keeps it in the new config', async () => {
    const root = project({
      dataIn: ['.cache-x'],
      files: [['layerscope.config.mjs', EXISTING]],
    });
    const { code, stderr } = await init(root, '--force', '--verbose');
    expect(code).toBe(EXIT_CLEAN);
    expect(stderr).toContain(readFrom(root, '.cache-x'));
    expect(read(root, 'layerscope.config.mjs')).toContain("  buildDir: '.cache-x',");
  });

  it('reads it with --dry-run too, and writes nothing', async () => {
    const root = project({
      dataIn: ['.cache-x'],
      files: [['layerscope.config.mjs', EXISTING]],
    });
    const { code, stderr } = await init(root, '--dry-run', '--verbose');
    expect(code).toBe(EXIT_CLEAN);
    expect(stderr).toContain(readFrom(root, '.cache-x'));
    expect(read(root, 'layerscope.config.mjs')).toBe(EXISTING);
  });

  it('reads the buildDir of the file that --config names', async () => {
    const root = project({ dataIn: ['.cache-x'], files: [['custom.config.mjs', EXISTING]] });
    const { code, stderr } = await init(
      root,
      '--config',
      'custom.config.mjs',
      '--force',
      '--verbose',
    );
    expect(code).toBe(EXIT_CLEAN);
    expect(stderr).toContain(readFrom(root, '.cache-x'));
  });
});

describe('init and an existing config that gives no usable buildDir', () => {
  it('treats a buildDir of null in the existing config as unset', async () => {
    const root = project({
      files: [['layerscope.config.mjs', 'export default { buildDir: null };\n']],
    });
    const { code } = await init(root, '--force');
    expect(code).toBe(EXIT_CLEAN);
    expect(read(root, 'layerscope.config.mjs')).not.toContain('buildDir');
  });

  it('replaces a config that does not load, with --force', async () => {
    const root = project({
      files: [['layerscope.config.mjs', 'export default 42;\n']],
    });
    expect((await init(root, '--force')).code).toBe(EXIT_CLEAN);
    expect(read(root, 'layerscope.config.mjs')).toContain('defineConfig');
  });
});
