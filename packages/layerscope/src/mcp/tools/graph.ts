import { buildGraph, GRAPH_LEVELS } from '#src/graph/index.ts';
import { DEFAULT_LIMIT, MAX_LIMIT } from '#src/mcp/tools/check.ts';
import type { Tool } from '#src/mcp/types.ts';

export const graphTool: Tool = {
  name: 'graph',
  title: 'The layer graph',
  description:
    'Which layer depends on which, with the number of references and a status for each edge ' +
    '(`not-allowed` when a reference breaks the rules). Level `file` lists files and is cut at ' +
    '`limit` nodes and edges.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      level: { type: 'string', enum: [...GRAPH_LEVELS], description: 'Default layer.' },
      limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, description: 'Default 50.' },
    },
  },
  outputSchema: {
    type: 'object',
    required: ['level', 'nodes', 'edges', 'truncated'],
    properties: {
      level: { type: 'string' },
      nodes: { type: 'array' },
      edges: { type: 'array' },
      truncated: { type: 'boolean' },
    },
  },
  async run(args, session) {
    const result = await session.result();
    const level = args.level === 'file' ? 'file' : 'layer';
    const graph = buildGraph(result, result.config, level);
    const limit = typeof args.limit === 'number' ? args.limit : DEFAULT_LIMIT;
    const cut = level === 'file';
    return {
      level,
      nodes: cut ? graph.nodes.slice(0, limit) : graph.nodes,
      edges: cut ? graph.edges.slice(0, limit) : graph.edges,
      totalNodes: graph.nodes.length,
      totalEdges: graph.edges.length,
      truncated: cut && (graph.nodes.length > limit || graph.edges.length > limit),
    };
  },
};
