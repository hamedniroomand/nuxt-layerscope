import { mentionsLayer } from '#src/config/allow.ts';
import type { Edge, Layer, LayerscopeConfig } from '#src/types.ts';

import { isAllowed } from './layer-boundary.ts';
import { isExposed } from './layer-internal.ts';

export type EdgeStatus =
  | 'same-layer'
  | 'external'
  | 'unrestricted'
  | 'allowed'
  | 'not-allowed'
  | 'not-exposed';

/** What graphs show: a symbol that is not exposed is a violation like one that is not allowed. */
export type GraphEdgeStatus = Exclude<EdgeStatus, 'not-exposed'>;

/** How the layer rules see one edge. */
export function edgeStatus(edge: Edge, config: LayerscopeConfig, layers: Layer[]): EdgeStatus {
  if (edge.toLayer === null) {
    return 'external';
  }
  if (edge.toLayer === edge.fromLayer) {
    return 'same-layer';
  }
  const allow = config.layers?.[edge.fromLayer]?.allow;
  if (allow !== undefined && !isAllowed(edge, allow, layers)) {
    return 'not-allowed';
  }
  if (!isExposed(edge, config, layers)) {
    return 'not-exposed';
  }
  return allow === undefined || !mentionsLayer(allow, edge.toLayer) ? 'unrestricted' : 'allowed';
}

export function graphStatus(
  edge: Edge,
  config: LayerscopeConfig,
  layers: Layer[],
): GraphEdgeStatus {
  const status = edgeStatus(edge, config, layers);
  return status === 'not-exposed' ? 'not-allowed' : status;
}
