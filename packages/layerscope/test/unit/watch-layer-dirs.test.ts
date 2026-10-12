import { describe, expect, it } from 'vite-plus/test';

import { layerDirs } from '#src/watch/watcher.ts';
import { makeLayer } from '#test/factories.ts';

describe('layerDirs', () => {
  it('gives the root of each layer and the source dirs outside it', () => {
    const layers = [
      { ...makeLayer('root', '/mono/web'), serverDir: '/mono/api', sharedDir: '/mono/web/shared' },
      makeLayer('shop', '/mono/web/layers/shop'),
    ];
    expect(layerDirs(layers)).toEqual(['/mono/web', '/mono/api', '/mono/web/layers/shop']);
  });
});
