import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { MATRIX_ROOT } from '#test/fixtures.ts';

const REMOTE_SOURCE = 'git:./.remote-layer-repo';

describe('remote layers', () => {
  it('can be named by their extends source', async () => {
    const result = await analyze({
      rootDir: MATRIX_ROOT,
      config: { layers: { 'remote-git': { source: REMOTE_SOURCE, allow: [] } } },
    });
    const layer = result.layers.find(candidate => candidate.name === 'remote-git');
    expect(layer?.root).toMatch(/\/node_modules\/\.c12\/git_remote_layer_\w+$/u);
  });

  it('report a source that matches no layer', async () => {
    await expect(
      analyze({
        rootDir: MATRIX_ROOT,
        config: { layers: { x: { source: 'github:org/missing' } } },
      }),
    ).rejects.toThrow('layers.x.source: no layer cloned from "github:org/missing"');
  });
});
