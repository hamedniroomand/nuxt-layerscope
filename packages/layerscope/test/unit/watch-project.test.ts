import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { buildDirOf, buildDirOrDefault, configPathOf } from '#src/watch/project.ts';
import { project, tempDir, write } from '#test/watch-project.ts';

describe('configPathOf', () => {
  it('gives the config file of the project', () => {
    const root = project(1);
    expect(configPathOf(root)).toBe(join(root, 'layerscope.config.mjs'));
  });

  it('gives undefined when there is no config file', () => {
    expect(configPathOf(tempDir())).toBeUndefined();
  });

  it('gives undefined for a config file that does not exist', () => {
    expect(configPathOf(tempDir(), 'missing.config.mjs')).toBeUndefined();
  });
});

describe('the build directory', () => {
  it('is .nuxt when the config sets none', async () => {
    const root = project(1);
    expect(await buildDirOf(root)).toBe(join(root, '.nuxt'));
  });

  it('follows buildDir of the config', async () => {
    const root = tempDir();
    write(root, 'layerscope.config.mjs', "export default { buildDir: 'out' };\n");
    expect(await buildDirOf(root)).toBe(join(root, 'out'));
  });

  it('falls back to .nuxt when the config cannot be loaded', async () => {
    const root = tempDir();
    write(root, 'layerscope.config.mjs', 'export default { layers: 1 };\n');
    expect(await buildDirOrDefault(root)).toBe(join(root, '.nuxt'));
  });
});
