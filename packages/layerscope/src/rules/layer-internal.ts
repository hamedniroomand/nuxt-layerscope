import { ruleSeverity } from '#src/config/rules.ts';
import type { Edge, Finding, Layer, LayerscopeConfig } from '#src/types.ts';

import { coversEdge } from './exposure.ts';
import { describeEdge, isAllowed } from './layer-boundary.ts';

/** Whether the layer the edge points into makes the symbol public. Without `expose`, all is. */
export function isExposed(edge: Edge, config: LayerscopeConfig, layers: Layer[]): boolean {
  if (edge.toLayer === null || edge.toLayer === edge.fromLayer) {
    return true;
  }
  const expose = config.layers?.[edge.toLayer]?.expose;
  if (expose === undefined) {
    return true;
  }
  const root = layers.find(layer => layer.name === edge.toLayer)?.root;
  return coversEdge(expose, edge, root);
}

export type Exposure = 'all' | 'exposed' | 'internal';

/** What the layer of the target says about a symbol: nothing set, public, or internal. */
export function exposureOf(edge: Edge, config: LayerscopeConfig, layers: Layer[]): Exposure {
  if (edge.toLayer === null || config.layers?.[edge.toLayer]?.expose === undefined) {
    return 'all';
  }
  return isExposed({ ...edge, fromLayer: '' }, config, layers) ? 'exposed' : 'internal';
}

/**
 * Uses of symbols that their layer keeps internal. A use that `allow` does not reach is a
 * `layer-boundary` finding already, so it is not reported twice.
 */
export function internalFindings(
  edges: Edge[],
  config: LayerscopeConfig,
  layers: Layer[],
): Finding[] {
  const severity = ruleSeverity(config, 'layer-internal');
  if (severity === 'off') {
    return [];
  }
  return edges.flatMap(edge => {
    const allow = config.layers?.[edge.fromLayer]?.allow;
    const reachable = allow === undefined || isAllowed(edge, allow, layers);
    const expose = config.layers?.[edge.toLayer ?? '']?.expose;
    if (!reachable || expose === undefined || isExposed(edge, config, layers)) {
      return [];
    }
    return [
      {
        rule: 'layer-internal' as const,
        severity,
        file: edge.file,
        line: edge.line,
        column: edge.column,
        symbol: edge.symbol,
        fromLayer: edge.fromLayer,
        toLayer: edge.toLayer,
        target: edge.to,
        exposed: expose,
        message: `${describeEdge(edge)} is internal to layer "${edge.toLayer}"`,
      },
    ];
  });
}
