import { ruleSeverity } from '#src/config/rules.ts';
import type { Edge, Finding, LayerscopeConfig } from '#src/types.ts';
import { compareStrings } from '#src/utils/strings.ts';

import { shortestCycle } from './cycle.ts';

function firstEdges(edges: Edge[]): Map<string, Edge> {
  const first = new Map<string, Edge>();
  for (const edge of edges) {
    const key = `${edge.fromLayer}\0${edge.toLayer}`;
    if (edge.toLayer !== null && edge.toLayer !== edge.fromLayer && !first.has(key)) {
      first.set(key, edge);
    }
  }
  return first;
}

function adjacencyOf(first: Map<string, Edge>): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const { fromLayer, toLayer } of first.values()) {
    adjacency.set(fromLayer, [...(adjacency.get(fromLayer) ?? []), toLayer ?? '']);
  }
  return adjacency;
}

// ponytail: one finding per lowest layer of a cycle; other cycles through the same layers show up once this one is fixed.
export function cycleFindings(edges: Edge[], config: LayerscopeConfig): Finding[] {
  const severity = ruleSeverity(config, 'layer-cycle');
  if (severity === 'off') {
    return [];
  }
  const first = firstEdges(edges);
  const adjacency = adjacencyOf(first);
  const findings: Finding[] = [];
  for (const start of [...adjacency.keys()].toSorted(compareStrings)) {
    const chain = shortestCycle(start, adjacency);
    const edge = chain === null ? undefined : first.get(`${chain[0]}\0${chain[1]}`);
    if (chain === null || edge === undefined) {
      continue;
    }
    const symbol = chain.join(' → ');
    findings.push({
      rule: 'layer-cycle',
      severity,
      file: edge.file,
      line: edge.line,
      column: edge.column,
      symbol,
      fromLayer: chain[0],
      toLayer: chain[1],
      target: edge.to,
      message: `Layers form a cycle: ${symbol}`,
    });
  }
  return findings;
}
