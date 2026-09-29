import { relative } from 'pathe';

import type { EdgeStatus } from '#src/rules/edge-status.ts';
import { edgeStatus } from '#src/rules/edge-status.ts';
import type { AnalyzeResult, Edge, LayerscopeConfig } from '#src/types.ts';
import { compareStrings } from '#src/utils/strings.ts';

export const GRAPH_LEVELS = ['layer', 'file'] as const;

export type GraphLevel = (typeof GRAPH_LEVELS)[number];

export interface GraphNode {
  id: string;
  /** Owning layer; for layer graphs the node's own name. */
  layer: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** References behind this edge. */
  count: number;
  /** `not-allowed` when any reference behind it breaks the layer rules. */
  status: EdgeStatus;
}

export interface Graph {
  level: GraphLevel;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Worst first, so an aggregated edge takes the status of its worst reference.
const STATUS_ORDER: EdgeStatus[] = ['not-allowed', 'allowed', 'unrestricted', 'same-layer'];

function worse(a: EdgeStatus, b: EdgeStatus): EdgeStatus {
  return STATUS_ORDER.indexOf(a) <= STATUS_ORDER.indexOf(b) ? a : b;
}

function endpoints(edge: Edge, level: GraphLevel, rootDir: string): [string, string] | null {
  if (edge.toLayer === null || edge.to === null) {
    return null;
  }
  if (level === 'layer') {
    return edge.toLayer === edge.fromLayer ? null : [edge.fromLayer, edge.toLayer];
  }
  const from = relative(rootDir, edge.file);
  const to = relative(rootDir, edge.to);
  return from === to ? null : [from, to];
}

function collectNodes(result: AnalyzeResult, edges: Edge[], level: GraphLevel): GraphNode[] {
  if (level === 'layer') {
    return result.layers.map(layer => ({ id: layer.name, layer: layer.name }));
  }
  const layerByFile = new Map<string, string>();
  for (const edge of edges) {
    layerByFile.set(relative(result.rootDir, edge.file), edge.fromLayer);
    if (edge.to !== null && edge.toLayer !== null) {
      layerByFile.set(relative(result.rootDir, edge.to), edge.toLayer);
    }
  }
  return [...layerByFile]
    .map(([id, layer]) => ({ id, layer }))
    .toSorted((a, b) => compareStrings(a.id, b.id));
}

/** Dependencies between layers or files inside layers; packages are left out. */
export function buildGraph(
  result: AnalyzeResult,
  config: LayerscopeConfig,
  level: GraphLevel,
): Graph {
  const edges = new Map<string, GraphEdge>();
  const internal: Edge[] = [];
  for (const edge of result.edges) {
    const ends = endpoints(edge, level, result.rootDir);
    if (ends === null) {
      continue;
    }
    internal.push(edge);
    const [from, to] = ends;
    const key = `${from}\0${to}`;
    const status = edgeStatus(edge, config);
    const existing = edges.get(key);
    edges.set(
      key,
      existing === undefined
        ? { from, to, count: 1, status }
        : { ...existing, count: existing.count + 1, status: worse(existing.status, status) },
    );
  }
  return {
    level,
    nodes: collectNodes(result, internal, level),
    edges: [...edges.values()].toSorted(
      (a, b) => compareStrings(a.from, b.from) || compareStrings(a.to, b.to),
    ),
  };
}
