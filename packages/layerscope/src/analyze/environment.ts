import { effectiveConfig, labelConfigError } from '#src/config/effective.ts';
import type { ProjectConfig } from '#src/config/effective.ts';
import { readRegistry } from '#src/registry/read.ts';
import type { Registry } from '#src/registry/schema.ts';
import type { Layer, LayerscopeConfig, ResolutionSource, SourceOption } from '#src/types.ts';

import { createAnalysisEnv } from './analysis-env.ts';
import { staleConfigNote } from './config-freshness.ts';
import type { AnalysisEnv } from './file-analysis.ts';
import { assertFresh, assertRegistryFresh } from './freshness.ts';
import { loadLayers } from './layers.ts';
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
  source: ResolutionSource;
  sourceFile: string;
  /** `null` with the `.d.ts` fallback, which only lists the winning components. */
  registry: Registry | null;
  layers: Layer[];
  env: AnalysisEnv;
  notes: string[];
}

/** Read even when symbols come from the `.d.ts` files, so `nuxt.config` options still apply. */
function recordedConfig(buildDir: string, registry: Registry | null): ProjectConfig | undefined {
  if (registry !== null) {
    return registry.config;
  }
  const read = readRegistry(buildDir);
  return read.kind === 'ok' ? read.registry.config : undefined;
}

/** Everything the analysis reads from Nuxt: layers, the symbol registry and aliases. */
export async function loadEnvironment(options: EnvironmentOptions): Promise<Environment> {
  const { rootDir, buildDir } = options;
  const { registry, table, ...symbols } = loadSymbols(buildDir, options.source);
  const recorded = recordedConfig(buildDir, registry);
  const config = effectiveConfig(options.config, recorded);
  const { layers, ownerOf, notes } = await loadLayers(rootDir, config, registry?.layers).catch(
    (error: unknown) => {
      throw labelConfigError(error, recorded);
    },
  );
  const stale = registry === null ? null : staleConfigNote(rootDir, symbols.sourceFile);
  await (registry === null ? assertFresh(table, layers) : assertRegistryFresh(table, registry));
  return {
    ...symbols,
    config,
    notes: [...symbols.notes, ...notes, ...(stale === null ? [] : [stale])],
    registry,
    layers,
    env: createAnalysisEnv(table, ownerOf, buildDir, config),
  };
}
