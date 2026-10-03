import { describe, expect, it } from 'vite-plus/test';

import type { Layout, LayoutEdgeInput } from '#src/graph/layout.ts';
import { layoutGraph, NODE_HEIGHT, NODE_WIDTH } from '#src/graph/layout.ts';

function rankOf(layout: Layout, id: string): number {
  return layout.nodes.find(node => node.id === id)?.rank ?? -1;
}

function overlaps(layout: Layout): boolean {
  return layout.nodes.some((a, index) =>
    layout.nodes
      .slice(index + 1)
      .some(b => Math.abs(a.x - b.x) < NODE_WIDTH && Math.abs(a.y - b.y) < NODE_HEIGHT),
  );
}

/** A small pseudo-random generator, so the test graph is the same on every run. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function randomGraph(size: number, seed: number): { nodes: string[]; edges: LayoutEdgeInput[] } {
  const next = random(seed);
  const nodes = Array.from({ length: size }, (_, index) => `n${index}`);
  const edges = nodes.flatMap(from =>
    nodes.filter(to => to !== from && next() < 3 / size).map(to => ({ from, to })),
  );
  return { nodes, edges };
}

describe('layer graph layout', () => {
  it('reads left to right along "depends on"', () => {
    const layout = layoutGraph(
      ['shop', 'ui', 'base', 'admin'],
      [
        { from: 'shop', to: 'ui' },
        { from: 'ui', to: 'base' },
        { from: 'admin', to: 'shop' },
        { from: 'admin', to: 'base' },
      ],
    );
    expect(['admin', 'shop', 'ui', 'base'].map(id => rankOf(layout, id))).toEqual([0, 1, 2, 3]);
    expect(layout.edges.every(edge => !edge.reversed)).toBe(true);
    expect(overlaps(layout)).toBe(false);
    expect(layout.edges[0]?.path).toMatch(/^M[\d.]+ [\d.]+ C/u);
  });

  it('breaks a cycle by drawing one edge back below the ranks', () => {
    const layout = layoutGraph(
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' },
      ],
    );
    const reversed = layout.edges.filter(edge => edge.reversed);
    expect(reversed).toEqual([expect.objectContaining({ from: 'c', to: 'a' })]);
    expect(reversed[0]?.labelY).toBeGreaterThan(Math.max(...layout.nodes.map(node => node.y)));
    expect(layout.height).toBeGreaterThan(reversed[0]?.labelY ?? 0);
  });
});

describe('layer graph layout with cycles', () => {
  it('staggers return curves so their labels do not overlap', () => {
    const layout = layoutGraph(
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'b' },
      ],
    );
    const labels = layout.edges.filter(edge => edge.reversed).map(edge => edge.labelY);
    expect(labels).toHaveLength(2);
    expect(new Set(labels).size).toBe(2);
    expect(layout.height).toBeGreaterThan(Math.max(...labels));
  });

  it('places disconnected nodes and a single node, and skips self and unknown edges', () => {
    const layout = layoutGraph(
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'a' },
        { from: 'a', to: 'zz' },
      ],
    );
    expect(layout.nodes.map(node => node.rank)).toEqual([0, 0, 0]);
    expect(layout.edges).toEqual([]);
    expect(overlaps(layout)).toBe(false);
    const single = layoutGraph(['only'], []);
    expect(single.nodes).toHaveLength(1);
    expect(single.width).toBeGreaterThan(NODE_WIDTH);
  });
});

describe('layer graph layout at scale', () => {
  it('gives the same layout for the same graph', () => {
    const { nodes, edges } = randomGraph(15, 7);
    const first = layoutGraph(nodes, edges);
    expect(layoutGraph(nodes, edges)).toEqual(first);
    expect(overlaps(first)).toBe(false);
    for (const edge of first.edges.filter(item => !item.reversed)) {
      expect(rankOf(first, edge.from)).toBeLessThan(rankOf(first, edge.to));
    }
  });

  it('lays out 100 nodes in under 50 ms', () => {
    const { nodes, edges } = randomGraph(100, 3);
    const started = performance.now();
    layoutGraph(nodes, edges);
    expect(performance.now() - started).toBeLessThan(50);
  });
});
