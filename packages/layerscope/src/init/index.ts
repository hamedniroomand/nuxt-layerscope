import type { AnalyzeResult } from '#src/types.ts';

import { collectEdges } from './edges.ts';
import { fittingPreset } from './preset.ts';
import { measureReadiness } from './readiness.ts';
import type { Proposal } from './types.ts';

export { assertNoNuxtConfigLayers, assertWritable, findExistingConfig } from './guard.ts';
export { DEFAULT_BUILD_DIR, initBuildDir } from './build-dir.ts';
export { analysisConfig, readOldConfig } from './old-config.ts';
export type { OldConfig } from './old-config.ts';
export { renderConfig } from './render.ts';
export type { AllowedEdge, Cluster, PresetFit, Proposal, Readiness } from './types.ts';

/** Expects a result analyzed without an `allow` map, so the edges are what exists today. */
export function propose(result: AnalyzeResult): Proposal {
  const edges = collectEdges(result);
  return {
    edges,
    preset: fittingPreset(
      edges,
      result.layers.map(layer => layer.name),
    ),
    readiness: measureReadiness(result),
    remaining: result.findings,
  };
}
