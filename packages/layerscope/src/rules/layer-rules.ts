import type { Edge, Finding, Layer, LayerscopeConfig } from '#src/types.ts';

import { boundaryFindings } from './layer-boundary.ts';
import { internalFindings } from './layer-internal.ts';

/** The findings of the rules that look at one edge: `layer-boundary` and `layer-internal`. */
export function edgeFindings(edges: Edge[], config: LayerscopeConfig, layers: Layer[]): Finding[] {
  return [...boundaryFindings(edges, config, layers), ...internalFindings(edges, config, layers)];
}
