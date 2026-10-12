import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import type { Finding } from '#src/types.ts';
import {
  buildDirOf,
  buildDirOrDefault,
  configPathOf,
  needsPrepareHint,
} from '#src/watch/project.ts';
import { makeFinding } from '#test/factories.ts';
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

describe('needsPrepareHint', () => {
  const unresolved = (message: string): Finding =>
    makeFinding({ rule: 'unresolved-reference', message });

  it('is true for an identifier that is not resolved', () => {
    expect(needsPrepareHint([unresolved('"useX" is not a local binding')])).toBe(true);
  });

  it('is false for code that layerscope cannot read', () => {
    expect(
      needsPrepareHint([unresolved('Could not read import(): the path is not a fixed string.')]),
    ).toBe(false);
  });

  it('is true when one finding needs it and another cannot be read', () => {
    expect(
      needsPrepareHint([
        unresolved('Could not read import()'),
        unresolved('"useX" is not a local binding'),
      ]),
    ).toBe(true);
  });

  it('is false for other rules', () => {
    expect(needsPrepareHint([makeFinding()])).toBe(false);
  });
});
