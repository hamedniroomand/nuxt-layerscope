import { describe, expect, it } from 'vite-plus/test';

import { deriveDirectories } from '#src/nuxt/layer-factory.ts';

describe('deriveDirectories for @nuxt/kit without getLayerDirectories', () => {
  it('resolves custom dirs against the layer root', () => {
    const layer = { cwd: '/p/ui', config: { srcDir: 'src', serverDir: 'nitro' } };
    expect(deriveDirectories(layer, 1, { _layers: [] })).toEqual({
      root: '/p/ui',
      app: '/p/ui/src',
      server: '/p/ui/nitro',
      shared: '/p/ui/shared',
    });
  });

  it('takes the root serverDir from the resolved options', () => {
    const layer = { cwd: '/p', config: {} };
    expect(deriveDirectories(layer, 0, { _layers: [], serverDir: '/p/api' }).server).toBe('/p/api');
  });
});
