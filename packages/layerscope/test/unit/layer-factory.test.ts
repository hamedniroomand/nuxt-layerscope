import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { deriveDirectories, layerFromNuxt, layerFromPath } from '#src/nuxt/layer-factory.ts';

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

  it('uses config.rootDir and options.dir.shared when set', () => {
    const layer = { cwd: '/ignored', config: { rootDir: '/p/ui', dir: { shared: 'common' } } };
    expect(deriveDirectories(layer, 1, { _layers: [], dir: { shared: 'fallback' } })).toEqual({
      root: '/p/ui',
      app: '/p/ui',
      server: '/p/ui/server',
      shared: '/p/ui/common',
    });
  });

  it('falls back to options.dir.shared for shared', () => {
    const layer = { cwd: '/p/ui', config: {} };
    expect(deriveDirectories(layer, 1, { _layers: [], dir: { shared: 'common' } }).shared).toBe(
      '/p/ui/common',
    );
  });
});

describe('layerFromPath', () => {
  it('uses app/ as srcDir when it exists', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-')));
    mkdirSync(join(root, 'app'));
    const layer = layerFromPath('web', root);
    expect(layer).toMatchObject({
      name: 'web',
      root,
      srcDir: join(root, 'app'),
      serverDir: join(root, 'server'),
      sharedDir: join(root, 'shared'),
      defaultComponents: true,
    });
  });

  it('falls back to the layer root when app/ is missing', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-')));
    expect(layerFromPath('ui', root).srcDir).toBe(root);
  });
});

describe('layerFromNuxt', () => {
  it('prefers meta.name, then $meta.name, then root for index 0', () => {
    const dirs = { root: '/p', app: '/p', server: '/p/server', shared: '/p/shared' };
    expect(
      layerFromNuxt({ cwd: '/p', config: {}, meta: { name: 'from-meta' } }, 0, dirs).name,
    ).toBe('from-meta');
    expect(
      layerFromNuxt({ cwd: '/p', config: { $meta: { name: 'from-config' } } }, 1, dirs).name,
    ).toBe('from-config');
    expect(layerFromNuxt({ cwd: '/p', config: {} }, 0, dirs).name).toBe('root');
  });

  it('marks defaultComponents when components is unset', () => {
    const dirs = { root: '/p', app: '/p', server: '/p/server', shared: '/p/shared' };
    expect(layerFromNuxt({ cwd: '/p', config: {} }, 0, dirs).defaultComponents).toBe(true);
    expect(
      layerFromNuxt({ cwd: '/p', config: { components: false } }, 0, dirs).defaultComponents,
    ).toBe(false);
  });

  it('names non-root layers from the path basename when meta is absent', () => {
    const dirs = {
      root: '/p/layers/web',
      app: '/p/layers/web',
      server: '/p/layers/web/server',
      shared: '/p/layers/web/shared',
    };
    expect(layerFromNuxt({ cwd: '/p/layers/web', config: {} }, 1, dirs).name).toBe('web');
  });

  it('uses the c12 clone prefix for remote layers', () => {
    const root = '/app/node_modules/.c12/github_org_repo_abc123';
    const dirs = { root, app: root, server: `${root}/server`, shared: `${root}/shared` };
    expect(layerFromNuxt({ cwd: root, config: {} }, 1, dirs).name).toBe('github_org_repo');
  });
});
