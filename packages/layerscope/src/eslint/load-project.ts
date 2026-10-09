import { resolve } from 'pathe';

import { createAnalysisEnv } from '#src/analyze/analysis-env.ts';
import type { AnalysisEnv } from '#src/analyze/file-analysis.ts';
import { effectiveConfig } from '#src/config/effective.ts';
import { loadConfigSync } from '#src/config/load.ts';
import { nameLayers } from '#src/nuxt/layers.ts';
import { createOwnerLookup } from '#src/nuxt/owner.ts';
import { readRegistry, tableFromRegistry } from '#src/registry/read.ts';
import type { Layer, LayerscopeConfig } from '#src/types.ts';

export interface Project {
  rootDir: string;
  config: LayerscopeConfig;
  env: AnalysisEnv;
  layers: Layer[];
}

export type ProjectLoad = { ok: true; project: Project } | { ok: false; message: string };

/** Config, layers and symbols of a project, from its registry; Nuxt itself is never loaded. */
export function loadProject(rootDir: string): ProjectLoad {
  const fileConfig = loadConfigSync(rootDir);
  const buildDir = resolve(rootDir, fileConfig.buildDir ?? '.nuxt');
  const read = readRegistry(buildDir);
  if (read.kind !== 'ok') {
    return {
      ok: false,
      message: `${read.file} is missing or from another nuxt-layerscope release. Add "nuxt-layerscope" to "modules" in nuxt.config and run "nuxi prepare".`,
    };
  }
  const config = effectiveConfig(fileConfig, read.registry.config);
  const layers = nameLayers(read.registry.layers, rootDir, config);
  const table = tableFromRegistry(read.registry, buildDir);
  // Every finding is computed; ESLint's own rule severities decide what is reported.
  const lintConfig: LayerscopeConfig = {
    ...config,
    rules: {
      ...config.rules,
      'layer-boundary': 'error',
      'layer-internal': 'error',
      'unresolved-reference': 'warn',
    },
  };
  const env = createAnalysisEnv(table, createOwnerLookup(layers), buildDir, lintConfig);
  return { ok: true, project: { rootDir, config: lintConfig, env, layers } };
}
