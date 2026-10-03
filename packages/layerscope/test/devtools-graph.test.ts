import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { edgeView, graphView, nodeView } from '#src/devtools/graph-api.ts';
import { buildGraph } from '#src/graph/index.ts';
import { NODE_HEIGHT, NODE_WIDTH } from '#src/graph/layout-size.ts';
import { makeEdge, makeFinding, makeLayer, makeResult } from '#test/factories.ts';
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
  it('adds violations, severity and stats, and builds the matrix from the same edges', async () => {
    const view = await graphView(result());
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
    expect(view.layout?.nodes.map(node => [node.id, node.rank])).toEqual([
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
      (await graphView(nuxt4)).edges.map(({ from, to, count, status }) => ({
        from,
        to,
        count,
        status,
      })),
    ).toEqual(cli.edges);
    const matrix = await graphView(await analyze({ rootDir: MATRIX_ROOT }));
    // Package and git layers live under node_modules, at a path that differs between machines.
    for (const node of matrix.nodes) {
      node.root = node.root.includes('node_modules') ? '<installed>' : node.root;
    }
    await expect(`${JSON.stringify(matrix, null, 2)}\n`).toMatchFileSnapshot(
      'snapshots/graph/matrix-devtools.json',
    );
  }, 60_000);
});

/** Points along an SVG path made of `M x y` and `C …` segments, 20 per segment. */
function samples(path: string): { x: number; y: number }[] {
  const numbers = (path.match(/-?[\d.]+/gu) ?? []).map(Number);
  const points: { x: number; y: number }[] = [];
  let [x0 = 0, y0 = 0] = numbers;
  for (let index = 2; index + 5 < numbers.length + 1; index += 6) {
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0, x3 = 0, y3 = 0] = numbers.slice(index, index + 6);
    for (let step = 0; step <= 20; step += 1) {
      const t = step / 20;
      const u = 1 - t;
      points.push({
        x: u ** 3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3,
        y: u ** 3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3,
      });
    }
    [x0, y0] = [x3, y3];
  }
  return points;
}

describe('graph layout on demand', () => {
  it('leaves the layout out above 15 layers unless asked', async () => {
    const layers = Array.from({ length: 16 }, (_, index) =>
      makeLayer(`l${index}`, `/app/l${index}`),
    );
    const big = makeResult({ layers });
    expect((await graphView(big)).layout).toBeUndefined();
    expect((await graphView(big, true)).layout?.nodes).toHaveLength(16);
    expect((await graphView(makeResult())).layout).toBeDefined();
  });
});

describe('graph layout on the nuxt4 fixture', () => {
  it('routes no edge through a node it does not connect', async () => {
    const { layout } = await graphView(await analyze({ rootDir: NUXT4_ROOT }));
    const inset = 2;
    const nodes = layout?.nodes ?? [];
    expect(nodes.length).toBeGreaterThan(0);
    for (const edge of layout?.edges ?? []) {
      const others = nodes.filter(node => node.id !== edge.from && node.id !== edge.to);
      const crossed = samples(edge.path).flatMap(point =>
        others.filter(
          node =>
            point.x > node.x + inset &&
            point.x < node.x + NODE_WIDTH - inset &&
            point.y > node.y + inset &&
            point.y < node.y + NODE_HEIGHT - inset,
        ),
      );
      expect(
        crossed.map(node => node.id),
        `${edge.from} → ${edge.to}`,
      ).toEqual([]);
    }
  }, 60_000);
});
