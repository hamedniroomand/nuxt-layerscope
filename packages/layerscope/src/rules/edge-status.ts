import type { Edge, LayerscopeConfig } from '#src/types.ts';

import { isAllowed } from './layer-boundary.ts';

export type EdgeStatus = 'same-layer' | 'external' | 'unrestricted' | 'allowed' | 'not-allowed';

/** How the layer rules see one edge. */
export function edgeStatus(edge: Edge, config: LayerscopeConfig): EdgeStatus {
  if (edge.toLayer === null) {
    return 'external';
  }
  if (edge.toLayer === edge.fromLayer) {
    return 'same-layer';
  }
  const allow = config.layers?.[edge.fromLayer]?.allow;
  if (allow === undefined) {
    return 'unrestricted';
  }
  return isAllowed(edge, allow) ? 'allowed' : 'not-allowed';
}
