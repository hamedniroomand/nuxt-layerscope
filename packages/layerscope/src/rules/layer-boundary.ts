import { ruleSeverity } from '#src/config/rules.ts';
import type { Edge, Finding, LayerscopeConfig } from '#src/types.ts';

function describeEdge(edge: Edge): string {
  if (edge.kind === 'component') {
    return `Component <${edge.symbol}>`;
  }
  return edge.kind === 'import' ? `Import "${edge.symbol}"` : `Auto-import "${edge.symbol}"`;
}

/** Edges to packages and within a layer are always allowed. */
export function isAllowed(edge: Edge, allow: string[]): boolean {
  return edge.toLayer === null || edge.toLayer === edge.fromLayer || allow.includes(edge.toLayer);
}

export function boundaryFindings(edges: Edge[], config: LayerscopeConfig): Finding[] {
  const severity = ruleSeverity(config, 'layer-boundary');
  if (severity === 'off') {
    return [];
  }
  return edges.flatMap(edge => {
    // A layer without an allow list is unrestricted.
    const allow = config.layers?.[edge.fromLayer]?.allow;
    if (allow === undefined || isAllowed(edge, allow)) {
      return [];
    }
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
      allowed: allow,
      message: `${describeEdge(edge)} crosses from layer "${edge.fromLayer}" into "${edge.toLayer}"`,
    };
    return [finding];
  });
}
