/**
 * Layered layout for the layer graph: deterministic, small, and meant for 2 to 15 layers.
 * Left to right reads "depends on": an edge from A to B puts A in an earlier column than B.
 */

export interface LayoutEdgeInput {
  from: string;
  to: string;
}

export interface LayoutNode {
  id: string;
  rank: number;
  /** Position inside the rank, top to bottom. */
  order: number;
  x: number;
  y: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
  /** The edge closes a cycle; it is drawn back with a curve below the ranks. */
  reversed: boolean;
  /** SVG path data. */
  path: string;
  /** Where the count label goes. */
  labelX: number;
  labelY: number;
}

export interface Layout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export const NODE_WIDTH = 120;
export const NODE_HEIGHT = 40;
const GAP_X = 80;
const GAP_Y = 32;
const MARGIN = 16;
const RETURN_DEPTH = 28;

type Adjacency = Map<string, string[]>;

function adjacency(nodes: string[], edges: LayoutEdgeInput[]): Adjacency {
  const next: Adjacency = new Map(nodes.map(node => [node, []]));
  for (const edge of edges) {
    next.get(edge.from)?.push(edge.to);
  }
  return next;
}

/** Edges that close a cycle, found by a depth-first search in node order. */
function backEdges(nodes: string[], next: Adjacency): Set<string> {
  const state = new Map<string, 'open' | 'done'>();
  const back = new Set<string>();
  const visit = (node: string): void => {
    state.set(node, 'open');
    for (const target of next.get(node) ?? []) {
      const seen = state.get(target);
      if (seen === 'open') {
        back.add(`${node}\0${target}`);
      } else if (seen === undefined) {
        visit(target);
      }
    }
    state.set(node, 'done');
  };
  for (const node of nodes) {
    if (!state.has(node)) {
      visit(node);
    }
  }
  return back;
}

/** Longest path from a source over the edges that keep the graph acyclic. */
function ranks(nodes: string[], forward: LayoutEdgeInput[]): Map<string, number> {
  const rank = new Map(nodes.map(node => [node, 0]));
  // A DAG settles after at most one pass per node; each pass only raises ranks.
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false;
    for (const { from, to } of forward) {
      const wanted = (rank.get(from) ?? 0) + 1;
      if ((rank.get(to) ?? 0) < wanted) {
        rank.set(to, wanted);
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }
  return rank;
}

function barycenter(node: string, neighbors: Adjacency, position: Map<string, number>): number {
  const around = (neighbors.get(node) ?? []).map(other => position.get(other) ?? 0);
  return around.length === 0
    ? (position.get(node) ?? 0)
    : around.reduce((a, b) => a + b, 0) / around.length;
}

/** Rows within each rank, ordered by two barycenter sweeps to cut crossings. */
function orderRanks(
  nodes: string[],
  rank: Map<string, number>,
  forward: LayoutEdgeInput[],
): string[][] {
  const columns: string[][] = [];
  for (const node of nodes) {
    const index = rank.get(node) ?? 0;
    columns[index] = [...(columns[index] ?? []), node];
  }
  const dense = columns.filter(column => column.length > 0);
  const before = adjacency(
    nodes,
    forward.map(edge => ({ from: edge.to, to: edge.from })),
  );
  const after = adjacency(nodes, forward);
  const position = new Map<string, number>();
  const place = (): void => {
    for (const column of dense) {
      for (const [index, node] of column.entries()) {
        position.set(node, index);
      }
    }
  };
  place();
  for (const [sweep, neighbors] of [
    [dense.slice(1), before],
    [dense.slice(0, -1).toReversed(), after],
  ] as const) {
    for (const column of sweep) {
      const keyed = column.map((node, index) => ({
        node,
        index,
        key: barycenter(node, neighbors, position),
      }));
      keyed.sort((a, b) => a.key - b.key || a.index - b.index);
      column.splice(0, column.length, ...keyed.map(entry => entry.node));
      place();
    }
  }
  return dense;
}

function edgePath(
  from: LayoutNode,
  to: LayoutNode,
  reversed: boolean,
  bottom: number,
): Omit<LayoutEdge, 'from' | 'to' | 'reversed'> {
  if (reversed) {
    // From the bottom of `from`, under every rank, back up into the bottom of `to`.
    const x1 = from.x + NODE_WIDTH / 2;
    const x2 = to.x + NODE_WIDTH / 2;
    const y1 = from.y + NODE_HEIGHT;
    const y2 = to.y + NODE_HEIGHT;
    const low = bottom + RETURN_DEPTH;
    return {
      path: `M${x1} ${y1} C${x1} ${low} ${x2} ${low} ${x2} ${y2}`,
      labelX: (x1 + x2) / 2,
      labelY: low - 4,
    };
  }
  const x1 = from.x + NODE_WIDTH;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_HEIGHT / 2;
  const bend = (x2 - x1) / 2;
  return {
    path: `M${x1} ${y1} C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`,
    labelX: (x1 + x2) / 2,
    labelY: (y1 + y2) / 2 - 6,
  };
}

/** Positions for every node and a path for every edge. Self-edges are ignored. */
export function layoutGraph(nodeIds: string[], input: LayoutEdgeInput[]): Layout {
  const nodes = [...new Set(nodeIds)];
  const known = new Set(nodes);
  const edges = input.filter(
    edge => edge.from !== edge.to && known.has(edge.from) && known.has(edge.to),
  );
  const back = backEdges(nodes, adjacency(nodes, edges));
  const isBack = (edge: LayoutEdgeInput): boolean => back.has(`${edge.from}\0${edge.to}`);
  const forward = edges.filter(edge => !isBack(edge));
  const columns = orderRanks(nodes, ranks(nodes, forward), forward);
  const placed = new Map<string, LayoutNode>();
  for (const [rank, column] of columns.entries()) {
    for (const [order, id] of column.entries()) {
      placed.set(id, {
        id,
        rank,
        order,
        x: MARGIN + rank * (NODE_WIDTH + GAP_X),
        y: MARGIN + order * (NODE_HEIGHT + GAP_Y),
      });
    }
  }
  const rows = Math.max(1, ...columns.map(column => column.length));
  const bottom = MARGIN + rows * (NODE_HEIGHT + GAP_Y) - GAP_Y;
  const hasBack = back.size > 0;
  const laidOut = edges.flatMap(edge => {
    const from = placed.get(edge.from);
    const to = placed.get(edge.to);
    if (from === undefined || to === undefined) {
      return [];
    }
    const reversed = isBack(edge);
    return [{ from: edge.from, to: edge.to, reversed, ...edgePath(from, to, reversed, bottom) }];
  });
  return {
    nodes: [...placed.values()],
    edges: laidOut,
    width: MARGIN * 2 + columns.length * (NODE_WIDTH + GAP_X) - GAP_X,
    height: bottom + MARGIN + (hasBack ? RETURN_DEPTH : 0),
  };
}
