import type { AnalyzeResult } from '#src/types.ts';

import { collectEdges } from './edges.ts';
import { measureReadiness } from './readiness.ts';
import type { Proposal } from './types.ts';

export { assertNoNuxtConfigLayers, assertWritable } from './guard.ts';
export { renderConfig } from './render.ts';
export type { AllowedEdge, Cluster, Proposal, Readiness } from './types.ts';

/** Expects a result analyzed without an `allow` map, so the edges are what exists today. */
export function propose(result: AnalyzeResult): Proposal {
  return {
    edges: collectEdges(result),
    readiness: measureReadiness(result),
    remaining: result.findings,
  };
}
