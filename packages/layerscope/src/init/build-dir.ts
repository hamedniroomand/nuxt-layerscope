import { relative } from 'pathe';

import { loadConfig } from '#src/config/load.ts';
import { nuxtBuildDir } from '#src/nuxt/layers.ts';

export const DEFAULT_BUILD_DIR = '.nuxt';

/**
 * The Nuxt build directory for `init`, relative to the root, or absolute when it is outside it. A `buildDir` in the layerscope config
 * that exists comes first, as for `check`. Then comes the `buildDir` of `nuxt.config`. Then `.nuxt`.
 * A config that does not load is ignored, so `--force` can replace a broken file.
 */
export async function initBuildDir(
  rootDir: string,
  existingConfig: string | null,
): Promise<string> {
  const config =
    existingConfig === null ? {} : await loadConfig(rootDir, existingConfig).catch(() => ({}));
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
