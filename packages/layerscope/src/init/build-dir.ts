import { relative } from 'pathe';

import { loadConfig } from '#src/config/load.ts';
import { nuxtBuildDir } from '#src/nuxt/layers.ts';

export const DEFAULT_BUILD_DIR = '.nuxt';

/**
 * The Nuxt build directory for `init`, relative to the root. A `buildDir` in the layerscope config
 * that exists comes first, as for `check`. Then comes the `buildDir` of `nuxt.config`. Then `.nuxt`.
 * A config that does not load is ignored, so `--force` can replace a broken file.
 */
export async function initBuildDir(
  rootDir: string,
  existingConfig: string | null,
): Promise<string> {
  const config =
    existingConfig === null ? {} : await loadConfig(rootDir, existingConfig).catch(() => ({}));
  if (config.buildDir !== undefined) {
    return config.buildDir;
  }
  const nuxt = await nuxtBuildDir(rootDir);
  return nuxt === null ? DEFAULT_BUILD_DIR : relative(rootDir, nuxt) || DEFAULT_BUILD_DIR;
}
