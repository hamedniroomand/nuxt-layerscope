import { existsSync } from 'node:fs';

import { basename, join, resolve } from 'pathe';

import type { Layer } from '#src/types.ts';
import { realPath } from '#src/utils/fs.ts';

import type { LayerDirectories, NuxtLayer, NuxtOptions } from './kit.ts';
import { remoteLayerName } from './remote-layer.ts';

export const ROOT_LAYER_NAME = 'root';

type Dirs = Pick<Layer, 'root' | 'srcDir' | 'serverDir' | 'sharedDir'>;

/** Fallback for `@nuxt/kit` releases without `getLayerDirectories`. */
export function deriveDirectories(
  layer: NuxtLayer,
  index: number,
  options: NuxtOptions,
): LayerDirectories {
  const root = resolve(layer.config.rootDir ?? layer.cwd);
  return {
    root,
    app: resolve(root, layer.config.srcDir ?? '.'),
    server:
      index === 0 && options.serverDir !== undefined
        ? resolve(options.serverDir)
        : resolve(root, layer.config.serverDir ?? 'server'),
    shared: resolve(root, layer.config.dir?.shared ?? options.dir?.shared ?? 'shared'),
  };
}

/** Real paths, so they match symlinked paths in generated types and imports. */
function toDirs(dirs: LayerDirectories): Dirs {
  const dir = (path: string): string => realPath(resolve(path));
  return {
    root: dir(dirs.root),
    srcDir: dir(dirs.app),
    serverDir: dir(dirs.server),
    sharedDir: dir(dirs.shared),
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
  };
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
    }),
    defaultComponents: true,
  };
}
