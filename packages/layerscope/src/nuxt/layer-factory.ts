import { existsSync } from 'node:fs';

import { basename, dirname, join, resolve } from 'pathe';

import type { Layer } from '#src/types.ts';
import { realPath } from '#src/utils/fs.ts';

import type { LayerDirectories, NuxtKit, NuxtLayer, NuxtOptions } from './kit.ts';
import { remoteLayerName } from './remote-layer.ts';

export const ROOT_LAYER_NAME = 'root';

type Dirs = Pick<Layer, 'root' | 'srcDir' | 'serverDir' | 'sharedDir' | 'modulesDir' | 'publicDir'>;

/** Fallback for `@nuxt/kit` releases without `getLayerDirectories`. */
export function deriveDirectories(
  layer: NuxtLayer,
  index: number,
  options: NuxtOptions,
): LayerDirectories {
  const root = resolve(layer.config.rootDir ?? layer.cwd);
  const app = resolve(root, layer.config.srcDir ?? '.');
  return {
    root,
    app,
    server:
      index === 0 && options.serverDir !== undefined
        ? resolve(options.serverDir)
        : resolve(root, layer.config.serverDir ?? 'server'),
    shared: resolve(root, layer.config.dir?.shared ?? options.dir?.shared ?? 'shared'),
    // Like kit 3.21 `getLayerDirectories`: Nuxt 3 resolves these from srcDir. An absolute
    // value (Nuxt 4 resolves them from the root) stays as it is.
    modules: resolve(app, layer.config.dir?.modules ?? 'modules'),
    public: resolve(app, layer.config.dir?.public ?? 'public'),
  };
}

/** Real paths, so they match symlinked paths in generated types and imports. */
function toDirs(dirs: LayerDirectories): Dirs {
  const dir = (path: string): string => realPath(resolve(path));
  // The Nuxt modules and public dirs keep their own path below the scanned dir, even when a dir on
  // that path is a symlink: the scanned files have paths through that name, and the skip rule
  // compares them to these dirs. Only the scanned dir is resolved, as `collectFiles` resolves it.
  const bases = [dirs.app, dirs.server, dirs.shared, dirs.root].map(base => resolve(base));
  const entry = (path: string): string => {
    const target = resolve(path);
    const base = bases
      .filter(candidate => target === candidate || target.startsWith(`${candidate}/`))
      .toSorted((a, b) => b.length - a.length)
      .at(0);
    if (base === undefined) {
      return join(dir(dirname(target)), basename(target));
    }
    // The dir can be the scanned dir itself (`dir.modules: '.'`).
    return target === base ? dir(base) : join(dir(base), target.slice(base.length + 1));
  };
  return {
    root: dir(dirs.root),
    srcDir: dir(dirs.app),
    serverDir: dir(dirs.server),
    sharedDir: dir(dirs.shared),
    modulesDir: entry(dirs.modules),
    publicDir: entry(dirs.public),
  };
}

export function layerFromNuxt(layer: NuxtLayer, index: number, dirs: LayerDirectories): Layer {
  const resolved = toDirs(dirs);
  return {
    name:
      layer.meta?.name ??
      layer.config.$meta?.name ??
      (index === 0 ? ROOT_LAYER_NAME : (remoteLayerName(resolved.root) ?? basename(resolved.root))),
    ...resolved,
    defaultComponents: layer.config.components === undefined,
    defaultImports:
      layer.config.imports?.scan !== false && (layer.config.imports?.dirs ?? []).length === 0,
  };
}

/**
 * The layers of a loaded Nuxt config. The module and the CLI both use this, with the project's own
 * kit, so they cannot disagree: kit 3 and kit 4 resolve the `public` dir of an extended layer
 * differently. A kit without `getLayerDirectories` (or none) gets the derived dirs.
 */
export function layersFromOptions(kit: NuxtKit | null, options: NuxtOptions): Layer[] {
  const dirs =
    kit?.getLayerDirectories?.({ options }) ??
    options._layers.map((layer, index) => deriveDirectories(layer, index, options));
  return options._layers.map((layer, index) => layerFromNuxt(layer, index, dirs[index]));
}

/** Without @nuxt/kit, assume Nuxt defaults: `app/` as srcDir when it exists (Nuxt 4). */
export function layerFromPath(name: string, root: string): Layer {
  const appDir = join(root, 'app');
  return {
    name,
    ...toDirs({
      root,
      app: existsSync(appDir) ? appDir : root,
      server: join(root, 'server'),
      shared: join(root, 'shared'),
      // Nuxt 4 puts both in the root. Without app/, srcDir is the root and both versions agree.
      modules: join(root, 'modules'),
      public: join(root, 'public'),
    }),
    defaultComponents: true,
  };
}
