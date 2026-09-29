import type { Graph } from '#src/graph/index.ts';

import { formatGraphDot } from './dot.ts';
import { formatGraphJson } from './json.ts';
import { formatGraphMermaid } from './mermaid.ts';

export const GRAPH_FORMATS = ['mermaid', 'dot', 'json'] as const;

export type GraphFormat = (typeof GRAPH_FORMATS)[number];

const formatters: Record<GraphFormat, (graph: Graph) => string> = {
  mermaid: formatGraphMermaid,
  dot: formatGraphDot,
  json: formatGraphJson,
};

export function isGraphFormat(value: string): value is GraphFormat {
  return Object.hasOwn(formatters, value);
}

export function formatGraph(graph: Graph, format: GraphFormat): string {
  return formatters[format](graph);
}
