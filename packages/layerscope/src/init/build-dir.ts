import { relative } from 'pathe';

import { nuxtBuildDir } from '#src/nuxt/layers.ts';
import type { LayerscopeConfig } from '#src/types.ts';

export const DEFAULT_BUILD_DIR = '.nuxt';

/**
 * The Nuxt build directory for `init`, relative to the root, or absolute when it is outside it. A `buildDir` in the layerscope config
 * that exists comes first, as for `check`. Then comes the `buildDir` of `nuxt.config`. Then `.nuxt`.
 */
export async function initBuildDir(rootDir: string, config: LayerscopeConfig): Promise<string> {
  // A `.js` config can set `null`, which `loadProject` treats as unset, so this does too.
  if (typeof config.buildDir === 'string') {
    return config.buildDir;
  }
  const nuxt = await nuxtBuildDir(rootDir);
  if (nuxt === null) {
    return DEFAULT_BUILD_DIR;
  }
  const folder = relative(rootDir, nuxt);
  // A path outside the root stays absolute: a `../..` path works only at the same folder depth.
  // A folder inside the root that starts with two dots, such as `..generated`, stays relative.
  const outside = folder === '..' || folder.startsWith('../');
  return outside ? nuxt : folder || DEFAULT_BUILD_DIR;
}
