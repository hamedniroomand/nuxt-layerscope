import { describe, expect, it } from 'vite-plus/test';

import type { Graph } from '#src/graph/index.ts';
import { formatGraphDot } from '#src/report/graph/dot.ts';

describe('formatGraphDot layer graph', () => {
  it('prints a flat digraph with red not-allowed edges', () => {
    const graph: Graph = {
      level: 'layer',
      nodes: [
        { id: 'web', layer: 'web' },
        { id: 'shop', layer: 'shop' },
      ],
      edges: [{ from: 'web', to: 'shop', count: 2, status: 'not-allowed' }],
    };
    expect(formatGraphDot(graph)).toBe(`digraph layerscope {
  rankdir=LR;
  "web";
  "shop";
  "web" -> "shop" [label=2, color=red, fontcolor=red];
}
`);
  });

  it('escapes quotes and backslashes in labels', () => {
    const graph: Graph = {
      level: 'layer',
      nodes: [{ id: 'a"b\\c', layer: 'a"b\\c' }],
      edges: [],
    };
    expect(formatGraphDot(graph)).toContain('"a\\"b\\\\c"');
  });
});

describe('formatGraphDot file graph', () => {
  it('groups nodes into subgraphs per layer', () => {
    const graph: Graph = {
      level: 'file',
      nodes: [
        { id: 'pages/a.vue', layer: 'web' },
        { id: 'composables/useX.ts', layer: 'shop' },
      ],
      edges: [{ from: 'pages/a.vue', to: 'composables/useX.ts', count: 1, status: 'allowed' }],
    };
    expect(formatGraphDot(graph)).toBe(`digraph layerscope {
  rankdir=LR;
  subgraph cluster_0 {
    label="web";
    "pages/a.vue";
  }
  subgraph cluster_1 {
    label="shop";
    "composables/useX.ts";
  }
  "pages/a.vue" -> "composables/useX.ts";
}
`);
  });
});
