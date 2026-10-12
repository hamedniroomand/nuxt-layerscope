import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import type { LayerDirectories } from '#src/nuxt/kit.ts';
import { deriveDirectories, layerFromNuxt, layerFromPath } from '#src/nuxt/layer-factory.ts';

const DIRS = {
  root: '/p',
  app: '/p',
  server: '/p/server',
  shared: '/p/shared',
  modules: '/p/modules',
  public: '/p/public',
};

function dirsOf(root: string): LayerDirectories {
  return {
    root,
    app: root,
    server: `${root}/server`,
    shared: `${root}/shared`,
    modules: `${root}/modules`,
    public: `${root}/public`,
  };
}

describe('deriveDirectories for @nuxt/kit without getLayerDirectories', () => {
  it('resolves custom dirs against the layer root', () => {
    const layer = { cwd: '/p/ui', config: { srcDir: 'src', serverDir: 'nitro' } };
    expect(deriveDirectories(layer, 1, { _layers: [] })).toEqual({
      root: '/p/ui',
      app: '/p/ui/src',
      server: '/p/ui/nitro',
      shared: '/p/ui/shared',
      // Nuxt 3 resolves these from srcDir.
      modules: '/p/ui/src/modules',
      public: '/p/ui/src/public',
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
      modules: '/p/ui/modules',
      public: '/p/ui/public',
    });
  });

  it('resolves dir.modules and dir.public against srcDir, and keeps an absolute value', () => {
    const layer = {
      cwd: '/p/ui',
      config: { srcDir: 'src', dir: { modules: 'mods', public: '/p/ui/static' } },
    };
    const derived = deriveDirectories(layer, 1, { _layers: [] });
    expect(derived.modules).toBe('/p/ui/src/mods');
    expect(derived.public).toBe('/p/ui/static');
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
      // Nuxt 4: the root holds both. `layerFromPath` does not read custom `dir.*` values.
      modulesDir: join(root, 'modules'),
      publicDir: join(root, 'public'),
      defaultComponents: true,
    });
  });

  it('falls back to the layer root when app/ is missing', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-')));
    const layer = layerFromPath('ui', root);
    expect(layer.srcDir).toBe(root);
    expect(layer.modulesDir).toBe(join(root, 'modules'));
  });
});

describe('layerFromNuxt', () => {
  it('prefers meta.name, then $meta.name, then root for index 0', () => {
    expect(
      layerFromNuxt({ cwd: '/p', config: {}, meta: { name: 'from-meta' } }, 0, DIRS).name,
    ).toBe('from-meta');
    expect(
      layerFromNuxt({ cwd: '/p', config: { $meta: { name: 'from-config' } } }, 1, DIRS).name,
    ).toBe('from-config');
    expect(layerFromNuxt({ cwd: '/p', config: {} }, 0, DIRS).name).toBe('root');
  });

  it('marks defaultComponents when components is unset', () => {
    expect(layerFromNuxt({ cwd: '/p', config: {} }, 0, DIRS).defaultComponents).toBe(true);
    expect(
      layerFromNuxt({ cwd: '/p', config: { components: false } }, 0, DIRS).defaultComponents,
    ).toBe(false);
  });

  it('names non-root layers from the path basename when meta is absent', () => {
    const root = '/p/layers/web';
    expect(layerFromNuxt({ cwd: root, config: {} }, 1, dirsOf(root)).name).toBe('web');
  });

  it('uses the c12 clone prefix for remote layers', () => {
    const root = '/app/node_modules/.c12/github_org_repo_abc123';
    expect(layerFromNuxt({ cwd: root, config: {} }, 1, dirsOf(root)).name).toBe('github_org_repo');
  });
});

describe('layerFromNuxt dirs', () => {
  it('takes modulesDir and publicDir from the kit dirs, without the trailing slash', () => {
    const dirs = {
      root: '/p',
      app: '/p/src',
      server: '/p/src/server',
      shared: '/p/shared',
      modules: '/p/mods/',
      public: '/p/pub/',
    };
    expect(layerFromNuxt({ cwd: '/p', config: {} }, 0, dirs)).toMatchObject({
      modulesDir: '/p/mods',
      publicDir: '/p/pub',
    });
  });
});
