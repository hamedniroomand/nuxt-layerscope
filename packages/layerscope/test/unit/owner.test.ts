import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { collectFiles } from '#src/analyze/files.ts';
import { createOwnerLookup } from '#src/nuxt/owner.ts';
import type { Layer } from '#src/types.ts';
import { makeLayer } from '#test/factories.ts';

function layer(name: string, root: string, dirs: Partial<Layer> = {}): Layer {
  return { ...makeLayer(name, root), ...dirs };
}

describe('createOwnerLookup', () => {
  it('finds the layer with the longest root', () => {
    const ownerOf = createOwnerLookup([
      layer('root', '/mono/web'),
      layer('shop', '/mono/web/layers/shop'),
    ]);
    expect(ownerOf('/mono/web/app/a.ts')?.name).toBe('root');
    expect(ownerOf('/mono/web/layers/shop/app/a.ts')?.name).toBe('shop');
    expect(ownerOf('/mono/other/a.ts')).toBeNull();
  });

  it('gives a serverDir outside the root to its layer', () => {
    const ownerOf = createOwnerLookup([layer('root', '/mono/web', { serverDir: '/mono/api' })]);
    expect(ownerOf('/mono/api/utils/x.ts')?.name).toBe('root');
    expect(ownerOf('/mono/apiary/x.ts')).toBeNull();
  });

  it('does the same for srcDir and the shared dir outside the root', () => {
    const ownerOf = createOwnerLookup([
      layer('root', '/mono/web', { srcDir: '/mono/ui', sharedDir: '/mono/common' }),
    ]);
    expect(ownerOf('/mono/ui/a.ts')?.name).toBe('root');
    expect(ownerOf('/mono/common/a.ts')?.name).toBe('root');
  });

  it('keeps the node_modules rule below the matched dir', () => {
    const ownerOf = createOwnerLookup([layer('root', '/mono/web', { serverDir: '/mono/api' })]);
    expect(ownerOf('/mono/api/node_modules/pkg/x.ts')).toBeNull();
    expect(ownerOf('/mono/web/node_modules/pkg/x.ts')).toBeNull();
  });
});

describe('createOwnerLookup with nested and stored layers', () => {
  it('lets the layer with the longer prefix win when a dir is inside the root of another layer', () => {
    // `serverDir: '../b/server'` of layer A lies inside the root of layer B. A names that dir as
    // its own server dir, and its prefix is longer than the root of B, so A owns the files.
    const ownerOf = createOwnerLookup([
      layer('a', '/mono/a', { serverDir: '/mono/b/server' }),
      layer('b', '/mono/b'),
    ]);
    expect(ownerOf('/mono/b/server/x.ts')?.name).toBe('a');
    expect(ownerOf('/mono/b/app/x.ts')?.name).toBe('b');
  });
});

describe('createOwnerLookup with equal prefixes', () => {
  it('gives a dir that is the root of a layer to that layer, not to a layer with it as a source dir', () => {
    // The first layer is the root layer: its serverDir is the root of layer B.
    const ownerOf = createOwnerLookup([
      layer('root', '/mono/web', { serverDir: '/mono/b' }),
      layer('b', '/mono/b'),
    ]);
    expect(ownerOf('/mono/b/app/x.ts')?.name).toBe('b');
    expect(ownerOf('/mono/b/x.ts')?.name).toBe('b');
  });

  it('gives the root of a layer to that layer also when it comes later in the list', () => {
    const ownerOf = createOwnerLookup([
      layer('b', '/mono/b'),
      layer('a', '/mono/a', { serverDir: '/mono/b' }),
    ]);
    expect(ownerOf('/mono/b/x.ts')?.name).toBe('b');
  });

  it('keeps the order of the layers when two roots or two source dirs are equal', () => {
    const twoRoots = createOwnerLookup([layer('a', '/mono/x'), layer('b', '/mono/x')]);
    expect(twoRoots('/mono/x/f.ts')?.name).toBe('a');
    const twoDirs = createOwnerLookup([
      layer('a', '/mono/a', { serverDir: '/mono/api' }),
      layer('b', '/mono/b', { serverDir: '/mono/api' }),
    ]);
    expect(twoDirs('/mono/api/f.ts')?.name).toBe('a');
  });

  it('leaves out a dir that a stored layer lacks or that is not a string', () => {
    const stored = { ...layer('root', '/mono/web'), serverDir: undefined, sharedDir: 5 };
    const ownerOf = createOwnerLookup([stored as unknown as Layer]);
    expect(ownerOf('/mono/web/app/a.ts')?.name).toBe('root');
    expect(ownerOf('/mono/api/x.ts')).toBeNull();
  });

  it('does not change a layer whose dirs are inside its root', () => {
    const ownerOf = createOwnerLookup([layer('root', '/mono/web', { srcDir: '/mono/web/app' })]);
    expect(ownerOf('/mono/web/server/a.ts')?.name).toBe('root');
    expect(ownerOf('/mono/web2/a.ts')).toBeNull();
  });
});

describe('createOwnerLookup with a source dir inside node_modules', () => {
  it('gives no owner to the files of a serverDir inside node_modules', () => {
    const ownerOf = createOwnerLookup([
      layer('root', '/mono/web', { serverDir: '/mono/node_modules/pkg/server' }),
    ]);
    expect(ownerOf('/mono/node_modules/pkg/server/x.ts')).toBeNull();
    expect(ownerOf('/mono/web/app/a.ts')?.name).toBe('root');
  });

  it('matches the node_modules segment, not the text', () => {
    const ownerOf = createOwnerLookup([
      layer('root', '/mono/web', { serverDir: '/mono/my_node_modules_x/server' }),
    ]);
    expect(ownerOf('/mono/my_node_modules_x/server/x.ts')?.name).toBe('root');
  });

  it('does not scan the files of a serverDir inside node_modules', async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-nm-')));
    const server = join(base, 'node_modules/pkg/server');
    mkdirSync(server, { recursive: true });
    mkdirSync(join(base, 'web'), { recursive: true });
    writeFileSync(join(server, 'x.ts'), 'export const x = 1;\n');
    const web = layer('root', join(base, 'web'), { serverDir: server });
    const files = await collectFiles([web], createOwnerLookup([web]), []);
    expect([...files.keys()]).toEqual([]);
  });
});
