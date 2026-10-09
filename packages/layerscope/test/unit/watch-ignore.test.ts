import { describe, expect, it } from 'vite-plus/test';

import { createIgnore, isConfigFile } from '#src/watch/ignore.ts';

const ignore = createIgnore('/p/.nuxt');

describe('createIgnore', () => {
  it.each([
    '/p/node_modules/pkg/index.ts',
    '/p/node_modules',
    '/p/.git/HEAD',
    '/p/.output/server/index.mjs',
    '/p/layers/a/dist/index.js',
  ])('skips %s', path => {
    expect(ignore(path)).toBe(true);
  });

  it.each(['/p', '/p/layers/a/app/pages/a.vue', '/p/layers/a/nuxt.config.ts'])('keeps %s', path => {
    expect(ignore(path)).toBe(false);
  });

  it('keeps only what the environment key reads inside the build dir', () => {
    expect(ignore('/p/.nuxt')).toBe(false);
    expect(ignore('/p/.nuxt/layerscope')).toBe(false);
    expect(ignore('/p/.nuxt/layerscope/registry.json')).toBe(false);
    expect(ignore('/p/.nuxt/types/imports.d.ts')).toBe(false);
    expect(ignore('/p/.nuxt/imports.d.ts')).toBe(false);
    expect(ignore('/p/.nuxt/app.config.mjs')).toBe(true);
    expect(ignore('/p/.nuxt/dev/index.mjs')).toBe(true);
  });
});

describe('createIgnore with Windows paths', () => {
  it('reads backslashes as separators', () => {
    expect(ignore(String.raw`/p/node_modules\pkg\index.ts`)).toBe(true);
    expect(ignore(String.raw`/p/.nuxt\app.config.mjs`)).toBe(true);
    expect(ignore(String.raw`/p/.nuxt\layerscope\registry.json`)).toBe(false);
    expect(isConfigFile(String.raw`/p/layers\a\nuxt.config.ts`)).toBe(true);
  });
});

describe('isConfigFile', () => {
  it('matches the config files of any layer', () => {
    expect(isConfigFile('/p/layers/a/nuxt.config.ts')).toBe(true);
    expect(isConfigFile('/p/layerscope.config.mjs')).toBe(true);
    expect(isConfigFile('/p/layers/a/app/config.ts')).toBe(false);
  });
});
