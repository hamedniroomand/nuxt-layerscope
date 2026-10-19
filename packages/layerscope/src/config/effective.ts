import { LayerscopeError } from '#src/errors.ts';
import { LayerConfigError } from '#src/layer-config-error.ts';
import type { LayerscopeConfig } from '#src/types.ts';

import { validateConfig } from './validate.ts';

/** Where the module's options live when they come from `nuxt.config`. */
const NUXT_CONFIG_LABEL = 'nuxt.config (layerscope)';

/** The keys that describe the project; `buildDir` only says where to look. */
export const PROJECT_CONFIG_KEYS = [
  'preset',
  'layers',
  'rules',
  'ignore',
  'globals',
  'typeImports',
] as const;

export type ProjectConfig = Pick<LayerscopeConfig, (typeof PROJECT_CONFIG_KEYS)[number]>;

export function hasProjectConfig(config: ProjectConfig): boolean {
  return PROJECT_CONFIG_KEYS.some(key => config[key] !== undefined);
}

export function pickProjectConfig(config: LayerscopeConfig): ProjectConfig {
  return Object.fromEntries(
    PROJECT_CONFIG_KEYS.flatMap(key => (config[key] === undefined ? [] : [[key, config[key]]])),
  );
}

/** The names of the project keys that `config` sets, quoted and joined: `"preset", "rules"`. */
export function keysSet(config: ProjectConfig): string {
  return PROJECT_CONFIG_KEYS.filter(key => config[key] !== undefined)
    .map(key => `"${key}"`)
    .join(', ');
}

/**
 * The options that a registry recorded, as the module writes them: only the project keys. The
 * registry holds only the project keys; a recorded value that is not an object stops the run, and
 * other keys are not read. `file` is the registry, for the message.
 */
export function recordedOptions(value: unknown, file: string): ProjectConfig | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new LayerscopeError(
      `${file}: the nuxt.config options (layerscope) that it recorded are not an object. Run "nuxi prepare" to write them again.`,
    );
  }
  return pickProjectConfig(value as LayerscopeConfig);
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
      `Project options are set both in layerscope.config (${keysSet(fileConfig)}) and in the "layerscope" key of nuxt.config (${keysSet(recorded)}). Keep one.`,
    );
  }
  validateConfig(recorded, NUXT_CONFIG_LABEL);
  return { ...fileConfig, ...recorded };
}

/** Names the `nuxt.config` key in a layer error, when the settings that caused it came from there. */
export function labelConfigError(error: unknown, recorded?: ProjectConfig): unknown {
  if (error instanceof LayerConfigError && recorded !== undefined && hasProjectConfig(recorded)) {
    return new LayerscopeError(`${NUXT_CONFIG_LABEL}: ${error.message}`);
  }
  return error;
}

export { applyPreset, layersFilledByPreset } from './presets.ts';
