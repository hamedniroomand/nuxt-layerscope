import { describe, expect, it } from 'vite-plus/test';

import {
  cellShade,
  edgesOf,
  formatSelection,
  nearestNode,
  parseSelection,
  markerFor,
  strokeWidth,
  symbolLabel,
  visibleEdges,
} from '#src/devtools/client/lib/graph-model.ts';
import { zoomAround } from '#src/devtools/client/lib/pan-zoom.ts';
import type { GraphView } from '#src/devtools/protocol.ts';

describe('graph selection in the hash', () => {
  it('reads and writes node and edge selections', () => {
    expect(parseSelection('node/admin')).toEqual({ kind: 'node', layer: 'admin' });
    expect(parseSelection('edge/admin/web')).toEqual({ kind: 'edge', from: 'admin', to: 'web' });
    expect(parseSelection('edge/admin')).toBeNull();
    expect(parseSelection('')).toBeNull();
    expect(parseSelection('node/')).toBeNull();
    expect(formatSelection({ kind: 'edge', from: 'a', to: 'b' })).toBe('edge/a/b');
    expect(formatSelection({ kind: 'node', layer: 'a' })).toBe('node/a');
    expect(formatSelection(null)).toBeUndefined();
  });
});

describe('graph drawing helpers', () => {
  const edge = (
    from: string,
    to: string,
    count: number,
    violations: number,
  ): GraphView['edges'][number] => ({
    from,
    to,
    count,
    status: violations > 0 ? 'not-allowed' : 'allowed',
    violations,
    severity: violations > 0 ? 'error' : null,
  });
  const view = {
    edges: [edge('a', 'b', 1, 0), edge('a', 'c', 6, 2), edge('b', 'c', 3, 0)],
  } as GraphView;

  it('filters edges by violations and references', () => {
    expect(visibleEdges(view, { violationsOnly: true, minCount: 1 })).toEqual([view.edges[1]]);
    expect(visibleEdges(view, { violationsOnly: false, minCount: 3 })).toHaveLength(2);
    expect(edgesOf(view.edges, 'c').map(item => item.from)).toEqual(['a', 'b']);
  });

  it('scales strokes, shades cells and shortens specifiers', () => {
    expect(strokeWidth(1)).toBe(1);
    expect(strokeWidth(8)).toBe(4);
    expect(
      [strokeWidth(1), strokeWidth(2), strokeWidth(3), strokeWidth(8)].map(width =>
        markerFor(width),
      ),
    ).toEqual(['ls-arrow', 'ls-arrow', 'ls-arrow-lg', 'ls-arrow-lg']);
    expect([0, 1, 5, 10].map(count => cellShade(count, 10))).toEqual([0, 1, 2, 3]);
    expect(cellShade(3, 0)).toBe(0);
    expect(symbolLabel('#layers/web/app/composables/useCart')).toBe('useCart');
    expect(symbolLabel('useCart')).toBe('useCart');
  });
});

describe('graph keyboard and zoom', () => {
  it('moves to the nearest node in a direction', () => {
    const nodes = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 200, y: 0 },
      { id: 'c', x: 200, y: 80 },
      { id: 'd', x: 400, y: 0 },
    ];
    expect(nearestNode(nodes, 'a', 'right')).toBe('b');
    expect(nearestNode(nodes, 'b', 'down')).toBe('c');
    expect(nearestNode(nodes, 'a', 'left')).toBeNull();
    expect(nearestNode(nodes, 'zz', 'left')).toBe('a');
  });

  it('zooms around the pointer and keeps the scale in range', () => {
    expect(zoomAround({ x: 0, y: 0, scale: 1 }, 2, 100, 50)).toEqual({ x: -100, y: -50, scale: 2 });
    expect(zoomAround({ x: 0, y: 0, scale: 3 }, 2, 0, 0).scale).toBe(3);
    expect(zoomAround({ x: 0, y: 0, scale: 0.3 }, 0.5, 0, 0).scale).toBe(0.3);
  });
});
