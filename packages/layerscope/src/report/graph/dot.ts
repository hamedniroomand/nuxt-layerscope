import type { Graph, GraphEdge } from '#src/graph/index.ts';

function quote(text: string): string {
  return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function edgeLine(edge: GraphEdge): string {
  const attributes = [
    ...(edge.count > 1 ? [`label=${edge.count}`] : []),
    ...(edge.status === 'not-allowed' ? ['color=red', 'fontcolor=red'] : []),
  ];
  const suffix = attributes.length > 0 ? ` [${attributes.join(', ')}]` : '';
  return `  ${quote(edge.from)} -> ${quote(edge.to)}${suffix};`;
}

function nodeLines(graph: Graph): string[] {
  if (graph.level === 'layer') {
    return graph.nodes.map(node => `  ${quote(node.id)};`);
  }
  const lines: string[] = [];
  for (const [index, [layer, nodes]] of [
    ...Map.groupBy(graph.nodes, node => node.layer),
  ].entries()) {
    lines.push(
      `  subgraph cluster_${index} {`,
      `    label=${quote(layer)};`,
      ...nodes.map(node => `    ${quote(node.id)};`),
      '  }',
    );
  }
  return lines;
}

/** Graphviz DOT; edges that break the layer rules are red. */
export function formatGraphDot(graph: Graph): string {
  const lines = [
    'digraph layerscope {',
    '  rankdir=LR;',
    ...nodeLines(graph),
    ...graph.edges.map(edge => edgeLine(edge)),
    '}',
  ];
  return `${lines.join('\n')}\n`;
}
