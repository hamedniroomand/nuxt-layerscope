import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { loadLayers } from '#src/analyze/layers.ts';
import type { Layer } from '#src/types.ts';

function projectWithApp(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-')));
  mkdirSync(join(root, 'app'));
  return root;
}

function layer(root: string, srcDir: string): Layer {
  return {
    name: 'root',
    root,
    srcDir,
    serverDir: join(root, 'server'),
    sharedDir: join(root, 'shared'),
    defaultComponents: true,
  };
}

describe('loadLayers notes', () => {
  it('warns when an app/ dir is ignored because srcDir points elsewhere', async () => {
    const root = projectWithApp();
    const { notes } = await loadLayers(root, {}, [layer(root, join(root, 'src'))]);
    expect(notes).toEqual([expect.stringContaining('Layer "root" has srcDir src')]);
  });

  it('stays quiet when srcDir exists', async () => {
    const root = projectWithApp();
    const { notes } = await loadLayers(root, {}, [layer(root, join(root, 'app'))]);
    expect(notes).toEqual([]);
  });
});
