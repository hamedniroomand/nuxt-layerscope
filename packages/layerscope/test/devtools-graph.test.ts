import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { edgeView, graphView, nodeView } from '#src/devtools/graph-api.ts';
import { buildGraph } from '#src/graph/index.ts';
import { makeEdge, makeFinding, makeResult } from '#test/factories.ts';
import { MATRIX_ROOT, NUXT4_ROOT } from '#test/fixtures.ts';

const shopFile = '/app/layers/shop/composables/useCart.ts';

function result(): ReturnType<typeof makeResult> {
  return makeResult({
    config: { layers: { web: { allow: [] } } },
    files: ['/app/pages/index.vue', '/app/pages/cart.vue', shopFile],
    edges: [
      makeEdge(),
      makeEdge({ file: '/app/pages/cart.vue', symbol: '#imports:useCart' }),
      makeEdge({ symbol: 'CartBadge', kind: 'component' }),
    ],
    findings: [makeFinding(), makeFinding({ severity: 'warn', symbol: 'CartBadge' })],
  });
}

describe('graph payload', () => {
  it('adds violations, severity and stats, and builds the matrix from the same edges', () => {
    const view = graphView(result());
    expect(view.edges).toEqual([
      {
        from: 'web',
        to: 'shop',
        count: 3,
        status: 'not-allowed',
        violations: 2,
        severity: 'error',
      },
    ]);
    expect(view.nodes.map(node => [node.id, node.files, node.refsOut, node.refsIn])).toEqual([
      ['web', 2, 3, 0],
      ['shop', 1, 0, 3],
    ]);
    expect(view.matrix).toEqual({
      layers: ['web', 'shop'],
      cells: [
        [
          { count: 0, status: null, violations: 0 },
          { count: 3, status: 'not-allowed', violations: 2 },
        ],
        [
          { count: 0, status: null, violations: 0 },
          { count: 0, status: null, violations: 0 },
        ],
      ],
    });
    expect(view.layout.nodes.map(node => [node.id, node.rank])).toEqual([
      ['web', 0],
      ['shop', 1],
    ]);
  });
});

describe('edge and node detail', () => {
  it('groups the references behind an edge by symbol, heaviest first', () => {
    const view = edgeView(result(), 'web', 'shop');
    expect(view).toMatchObject({ status: 'not-allowed', total: 3, truncated: 0 });
    expect(view.symbols.map(symbol => [symbol.symbol, symbol.count])).toEqual([
      ['useCart', 2],
      ['CartBadge', 1],
    ]);
    expect(view.symbols[0]?.rows[1]).toMatchObject({
      file: 'pages/cart.vue',
      absFile: '/app/pages/cart.vue',
    });
    expect(edgeView(result(), 'shop', 'web')).toMatchObject({
      status: null,
      total: 0,
      symbols: [],
    });
  });

  it('caps an edge at 500 references', () => {
    const many = Array.from({ length: 620 }, (_, line) => makeEdge({ line }));
    const view = edgeView(makeResult({ edges: many }), 'web', 'shop');
    expect(view.total).toBe(620);
    expect(view.truncated).toBe(120);
    expect(view.symbols[0]?.rows).toHaveLength(500);
  });

  it('lists a layer, its neighbors and a page of its files', () => {
    const view = nodeView(result(), 'web');
    expect(view).toMatchObject({
      in: [],
      out: [{ layer: 'shop', count: 3 }],
      total: 2,
      offset: 0,
    });
    expect(view?.files).toEqual([
      { file: 'pages/cart.vue', absFile: '/app/pages/cart.vue', refsIn: 0, refsOut: 1 },
      { file: 'pages/index.vue', absFile: '/app/pages/index.vue', refsIn: 0, refsOut: 2 },
    ]);
    expect(nodeView(result(), 'shop')?.files[0]).toMatchObject({ refsIn: 3 });
    expect(nodeView(result(), 'web', 1)?.files).toHaveLength(1);
    expect(nodeView(result(), 'nope')).toBeNull();
  });
});

describe('graph payload on fixtures', () => {
  it('matches `layerscope graph --format json` and the matrix snapshot', async () => {
    const nuxt4 = await analyze({ rootDir: NUXT4_ROOT });
    const cli = buildGraph(nuxt4, nuxt4.config, 'layer');
    expect(
      graphView(nuxt4).edges.map(({ from, to, count, status }) => ({ from, to, count, status })),
    ).toEqual(cli.edges);
    const matrix = graphView(await analyze({ rootDir: MATRIX_ROOT }));
    // Package and git layers live under node_modules, at a path that differs between machines.
    for (const node of matrix.nodes) {
      node.root = node.root.includes('node_modules') ? '<installed>' : node.root;
    }
    await expect(`${JSON.stringify(matrix, null, 2)}\n`).toMatchFileSnapshot(
      'snapshots/graph/matrix-devtools.json',
    );
  }, 60_000);
});
