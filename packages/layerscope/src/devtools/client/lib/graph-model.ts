import type { GraphEdgeView, GraphView } from '#src/devtools/protocol.ts';

/** Above this many layers the Graph view opens on the table; the graph stays one click away. */
export const TABLE_DEFAULT_ABOVE = 15;

export type GraphSelection =
  | { kind: 'node'; layer: string }
  | { kind: 'edge'; from: string; to: string }
  | null;

/** `node/A` or `edge/A/B`, the path after `#/graph/`. */
export function parseSelection(param: string | undefined): GraphSelection {
  const parts = (param ?? '').split('/');
  if (parts.some(part => part === '')) {
    return null;
  }
  const [kind = '', first = '', second = ''] = parts;
  if (kind === 'node' && parts.length === 2) {
    return { kind: 'node', layer: first };
  }
  return kind === 'edge' && parts.length === 3 ? { kind: 'edge', from: first, to: second } : null;
}

export function formatSelection(selection: GraphSelection): string | undefined {
  if (selection === null) {
    return undefined;
  }
  return selection.kind === 'node'
    ? `node/${selection.layer}`
    : `edge/${selection.from}/${selection.to}`;
}

export interface EdgeFilter {
  violationsOnly: boolean;
  /** Edges with fewer references are hidden. */
  minCount: number;
}

export function visibleEdges(view: GraphView, filter: EdgeFilter): GraphEdgeView[] {
  return view.edges.filter(
    edge => edge.count >= filter.minCount && (!filter.violationsOnly || edge.violations > 0),
  );
}

/** Heavier edges draw thicker, but slowly: 1 reference is 1 px, 8 are 4 px. */
export function strokeWidth(count: number): number {
  return 1 + Math.log2(Math.max(1, count));
}

/** Matrix shade from 0 (no references) to 3 (the heaviest cell). */
export function cellShade(count: number, max: number): number {
  if (count === 0 || max === 0) {
    return 0;
  }
  return Math.min(3, Math.ceil((count / max) * 3));
}

/** The short name of a symbol: an import specifier shows its last path part. */
export function symbolLabel(symbol: string): string {
  return symbol.includes('/') ? (symbol.split('/').at(-1) ?? symbol) : symbol;
}

export type Direction = 'left' | 'right' | 'up' | 'down';

interface Placed {
  id: string;
  x: number;
  y: number;
}

function isAhead(node: Placed, start: Placed, direction: Direction): boolean {
  if (direction === 'left') {
    return node.x < start.x;
  }
  if (direction === 'right') {
    return node.x > start.x;
  }
  return direction === 'up' ? node.y < start.y : node.y > start.y;
}

/** The node nearest to `from` in a direction, for arrow-key moves; `null` when there is none. */
export function nearestNode(nodes: Placed[], from: string, direction: Direction): string | null {
  const start = nodes.find(node => node.id === from);
  if (start === undefined) {
    return nodes[0]?.id ?? null;
  }
  const distance = (node: Placed): number => Math.hypot(node.x - start.x, node.y - start.y);
  const candidates = nodes.filter(node => node.id !== from && isAhead(node, start, direction));
  return candidates.toSorted((a, b) => distance(a) - distance(b))[0]?.id ?? null;
}

/** The edges of a layer in a fixed order, for cycling through them with `e`. */
export function edgesOf(edges: GraphEdgeView[], layer: string): GraphEdgeView[] {
  return edges.filter(edge => edge.from === layer || edge.to === layer);
}
