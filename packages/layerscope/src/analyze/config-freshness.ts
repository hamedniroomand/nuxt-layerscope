import { existsSync, statSync } from 'node:fs';

import { join } from 'pathe';

const NUXT_CONFIG_FILES = [
  'nuxt.config.ts',
  'nuxt.config.mts',
  'nuxt.config.js',
  'nuxt.config.mjs',
];

/**
 * The registry holds the `layerscope` key of `nuxt.config` as it was at the last `nuxi prepare`,
 * `dev` or `build`, so an edit made since then does not apply yet.
 */
export function staleConfigNote(rootDir: string, registryFile: string): string | null {
  const config = NUXT_CONFIG_FILES.map(name => join(rootDir, name)).find(file => existsSync(file));
  if (config === undefined || !existsSync(registryFile)) {
    return null;
  }
  if (statSync(config).mtimeMs <= statSync(registryFile).mtimeMs) {
    return null;
  }
  return 'nuxt.config is newer than the layerscope registry, so changes to its "layerscope" key do not apply yet. Run "nuxi prepare" again, or pass --prepare.';
}
