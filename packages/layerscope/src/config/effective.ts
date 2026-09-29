import { LayerscopeError } from '#src/errors.ts';
import type { LayerscopeConfig } from '#src/types.ts';

import { validateConfig } from './validate.ts';

/** Where the module's options live when they come from `nuxt.config`. */
const NUXT_CONFIG_LABEL = 'nuxt.config (layerscope)';

/** The keys that describe the project; `buildDir` only says where to look. */
export const PROJECT_CONFIG_KEYS = ['layers', 'rules', 'ignore', 'globals'] as const;

export type ProjectConfig = Pick<LayerscopeConfig, (typeof PROJECT_CONFIG_KEYS)[number]>;

function hasProjectConfig(config: ProjectConfig): boolean {
  return PROJECT_CONFIG_KEYS.some(key => config[key] !== undefined);
}

export function pickProjectConfig(config: LayerscopeConfig): ProjectConfig {
  return Object.fromEntries(
    PROJECT_CONFIG_KEYS.flatMap(key => (config[key] === undefined ? [] : [[key, config[key]]])),
  );
}

/**
 * `layerscope.config.*` or the `layerscope` key of `nuxt.config`, which the module records in the
 * registry. Both at once is an error rather than a merge, so it is always clear which one applies.
 */
export function effectiveConfig(
  fileConfig: LayerscopeConfig,
  recorded?: ProjectConfig,
): LayerscopeConfig {
  if (recorded === undefined || !hasProjectConfig(recorded)) {
    return fileConfig;
  }
  if (hasProjectConfig(fileConfig)) {
    throw new LayerscopeError(
      'Layers or rules are set both in layerscope.config and in the "layerscope" key of nuxt.config. Keep one.',
    );
  }
  validateConfig(recorded, NUXT_CONFIG_LABEL);
  return { ...fileConfig, ...recorded };
}
