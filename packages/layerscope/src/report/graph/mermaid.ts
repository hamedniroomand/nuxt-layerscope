import type { Graph, GraphEdge } from '#src/graph/index.ts';

const VIOLATION_STYLE = 'stroke:#d73a49,stroke-width:2px';

function label(text: string): string {
  return `"${text.replaceAll('"', '#quot;')}"`;
}

function edgeLine(edge: GraphEdge, ids: Map<string, string>): string {
  const arrow = edge.count > 1 ? `-- ${edge.count} -->` : '-->';
  return `  ${ids.get(edge.from)} ${arrow} ${ids.get(edge.to)}`;
}

function nodeLines(graph: Graph, ids: Map<string, string>): string[] {
  if (graph.level === 'layer') {
    return graph.nodes.map(node => `  ${ids.get(node.id)}[${label(node.id)}]`);
  }
  const lines: string[] = [];
  for (const [index, [layer, nodes]] of [
    ...Map.groupBy(graph.nodes, node => node.layer),
  ].entries()) {
    lines.push(
      `  subgraph layer${index}[${label(layer)}]`,
      ...nodes.map(node => `    ${ids.get(node.id)}[${label(node.id)}]`),
      '  end',
    );
  }
  return lines;
}

/** A Mermaid flowchart; edges that break the layer rules are drawn in red. */
export function formatGraphMermaid(graph: Graph): string {
  const ids = new Map(graph.nodes.map((node, index) => [node.id, `n${index}`]));
  const violations = graph.edges.flatMap((edge, index) =>
    edge.status === 'not-allowed' ? [index] : [],
  );
  const lines = [
    'flowchart LR',
    ...nodeLines(graph, ids),
    ...graph.edges.map(edge => edgeLine(edge, ids)),
  ];
  if (violations.length > 0) {
    lines.push(`  linkStyle ${violations.join(',')} ${VIOLATION_STYLE}`);
  }
  return `${lines.join('\n')}\n`;
}
