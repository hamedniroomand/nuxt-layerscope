import {
  applyPreset,
  effectiveConfig,
  labelConfigError,
  layersFilledByPreset,
  pickProjectConfig,
} from '#src/config/effective.ts';
import type { ProjectConfig } from '#src/config/effective.ts';
import { readRegistry } from '#src/registry/read.ts';
import type { Registry } from '#src/registry/schema.ts';
import type { Layer, LayerscopeConfig, ResolutionSource, SourceOption } from '#src/types.ts';

import { createAnalysisEnv } from './analysis-env.ts';
import { staleConfigNote } from './config-freshness.ts';
import type { AnalysisEnv } from './file-analysis.ts';
import { assertFresh, assertRegistryFresh } from './freshness.ts';
import { loadLayers } from './layers.ts';
import type { AnalysisLayers } from './layers.ts';
import { loadSymbols } from './symbols.ts';

export interface EnvironmentOptions {
  rootDir: string;
  buildDir: string;
  config: LayerscopeConfig;
  source: SourceOption;
}

export interface Environment {
  /** From `layerscope.config.*` or the `layerscope` key of `nuxt.config`. */
  config: LayerscopeConfig;
  /** Layers whose `allow` the preset filled. */
  presetLayers: string[];
  /** The project options as the config set them, before the preset is applied. */
  declaredConfig: ProjectConfig;
  /** The registry file that the `nuxt.config` options were read from, when there is one. */
  recordedFile?: string;
  source: ResolutionSource;
  sourceFile: string;
  /** `null` with the `.d.ts` fallback, which only lists the winning components. */
  registry: Registry | null;
  /** The Nuxt build dir, which holds the generated files. */
  buildDir: string;
  layers: Layer[];
  /** The ignore rules of Nuxt for the stale check without the registry. */
  isNuxtIgnored: AnalysisLayers['isNuxtIgnored'];
  env: AnalysisEnv;
  notes: string[];
}

/** Read even when symbols come from the `.d.ts` files, so `nuxt.config` options still apply. */
function recordedConfig(
  buildDir: string,
  registry: Registry | null,
  sourceFile: string,
): { config: ProjectConfig | undefined; file: string | undefined } {
  if (registry !== null) {
    return { config: registry.config, file: sourceFile };
  }
  const read = readRegistry(buildDir);
  // A stale registry is not used for layers or symbols, but its `config` is the only copy of the
  // options.
  return read.kind === 'ok' || read.kind === 'stale'
    ? { config: read.registry.config, file: read.file }
    : { config: undefined, file: undefined };
}

/** A preset that names a layer which does not exist is an error of the config that holds it. */
function presetApplied(
  config: LayerscopeConfig,
  layers: Layer[],
  recorded: ProjectConfig | undefined,
): LayerscopeConfig {
  try {
    return applyPreset(config, layers);
  } catch (error) {
    throw labelConfigError(error, recorded);
  }
}

/**
 * Stops the run when the symbols are stale. With the registry, it checks every dir that Nuxt
 * scanned. Without it, it checks the default `components/` dirs. It also finds a target file that
 * is gone.
 */
export async function assertSymbolsFresh(
  table: AnalysisEnv['table'],
  layers: Layer[],
  registry: Registry | null,
  isNuxtIgnored: AnalysisLayers['isNuxtIgnored'],
): Promise<void> {
  await (registry === null
    ? assertFresh(table, layers, isNuxtIgnored)
    : assertRegistryFresh(table, registry));
}

/** Everything the analysis reads from Nuxt: layers, the symbol registry and aliases. */
export async function loadEnvironment(options: EnvironmentOptions): Promise<Environment> {
  const { rootDir, buildDir } = options;
  const { registry, table, ...symbols } = loadSymbols(buildDir, options.source);
  const { config: recorded, file: recordedFile } = recordedConfig(
    buildDir,
    registry,
    symbols.sourceFile,
  );
  const effective = effectiveConfig(options.config, recorded);
  const { layers, isNuxtIgnored, ownerOf, notes } = await loadLayers(
    rootDir,
    effective,
    registry?.layers,
  ).catch((error: unknown) => {
    throw labelConfigError(error, recorded);
  });
  const config = presetApplied(effective, layers, recorded);
  const presetLayers = layersFilledByPreset(effective, config);
  const stale = recordedFile === undefined ? null : staleConfigNote(rootDir, recordedFile);
  await assertSymbolsFresh(table, layers, registry, isNuxtIgnored);
  return {
    ...symbols,
    config,
    presetLayers,
    declaredConfig: pickProjectConfig(effective),
    recordedFile,
    notes: [...symbols.notes, ...notes, ...(stale === null ? [] : [stale])],
    registry,
    buildDir,
    layers,
    isNuxtIgnored,
    env: createAnalysisEnv(table, ownerOf, buildDir, config, layers),
  };
}
