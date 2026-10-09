import { fullLayers, isScoped } from '#src/config/allow.ts';
import { ruleSeverity } from '#src/config/rules.ts';
import type { AllowEntry, Edge, Finding, Layer, LayerscopeConfig } from '#src/types.ts';

import { coversEdge } from './exposure.ts';

export function describeEdge(edge: Edge): string {
  if (edge.kind === 'component') {
    return `Component <${edge.symbol}>`;
  }
  return edge.kind === 'import' ? `Import "${edge.symbol}"` : `Auto-import "${edge.symbol}"`;
}

function rootOf(layers: Layer[], name: string | null): string | undefined {
  return layers.find(layer => layer.name === name)?.root;
}

/**
 * Edges to packages and within a layer are always allowed. A scoped entry allows the uses that
 * its `only` list covers. `layers` gives the roots that the globs of `only` are relative to.
 */
export function isAllowed(edge: Edge, allow: AllowEntry[], layers: Layer[] = []): boolean {
  if (edge.toLayer === null || edge.toLayer === edge.fromLayer) {
    return true;
  }
  return allow.some(entry =>
    isScoped(entry)
      ? entry.layer === edge.toLayer && coversEdge(entry.only, edge, rootOf(layers, edge.toLayer))
      : entry === edge.toLayer,
  );
}

function describeAllowed(allow: AllowEntry[], toLayer: string | null): string {
  const scoped = allow.filter(entry => isScoped(entry) && entry.layer === toLayer);
  return scoped.length === 0
    ? ''
    : ` (allowed: only ${scoped.flatMap(entry => (isScoped(entry) ? entry.only : [])).join(', ')})`;
}

export function boundaryFindings(
  edges: Edge[],
  config: LayerscopeConfig,
  layers: Layer[] = [],
): Finding[] {
  const severity = ruleSeverity(config, 'layer-boundary');
  if (severity === 'off') {
    return [];
  }
  return edges.flatMap(edge => {
    // A layer without an allow list is unrestricted.
    const allow = config.layers?.[edge.fromLayer]?.allow;
    if (allow === undefined || isAllowed(edge, allow, layers)) {
      return [];
    }
    const scoped = allow.filter(entry => isScoped(entry));
    const finding: Finding = {
      rule: 'layer-boundary',
      severity,
      file: edge.file,
      line: edge.line,
      column: edge.column,
      symbol: edge.symbol,
      fromLayer: edge.fromLayer,
      toLayer: edge.toLayer,
      target: edge.to,
      allowed: fullLayers(allow),
      ...(scoped.length > 0 && { scoped }),
      message: `${describeEdge(edge)} crosses from layer "${edge.fromLayer}" into "${edge.toLayer}"${describeAllowed(allow, edge.toLayer)}`,
    };
    return [finding];
  });
}
