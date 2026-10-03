import * as dagreModule from '@dagrejs/dagre';

import { NODE_HEIGHT, NODE_WIDTH } from './layout-size.ts';

export { NODE_HEIGHT, NODE_WIDTH } from './layout-size.ts';

/**
 * Layered layout for the layer graph, by dagre: edges are routed around nodes and labels get room
 * of their own. Left to right reads "depends on": an edge from A to B puts A before B.
 */

export interface LayoutEdgeInput {
  from: string;
  to: string;
  /**
   * How hard dagre keeps the edge left to right; 1 when not given. To break a cycle it turns the
   * lightest edges around, so a violation should weigh less than an allowed dependency.
   */
  weight?: number;
}

export interface LayoutNode {
  id: string;
  /** Column, left to right. */
  rank: number;
  /** Position inside the column, top to bottom. */
  order: number;
  x: number;
  y: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
  /** The edge runs right to left: it closes a cycle. */
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

const GAP_X = 80;
const GAP_Y = 32;
const MARGIN = 16;
/** Room dagre keeps free for an edge's count label. */
const LABEL_WIDTH = 28;
const LABEL_HEIGHT = 14;

interface Point {
  x: number;
  y: number;
}

/** The part of dagre the layout uses. */
interface DagreGraph {
  setGraph: (label: Record<string, number | string>) => void;
  setDefaultEdgeLabel: (label: () => object) => void;
  setNode: (id: string, label: { width: number; height: number }) => void;
  setEdge: (from: string, to: string, label: Record<string, number | string>) => void;
  node: (id: string) => Point;
  edge: (from: string, to: string) => { points: Point[]; x: number; y: number };
  graph: () => { width?: number; height?: number };
}

interface Dagre {
  Graph: new () => DagreGraph;
  layout: (graph: DagreGraph) => void;
}

// dagre's own .d.ts files import each other without extensions, which `nodenext` cannot resolve.
const dagre = dagreModule as unknown as Dagre;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** A smooth path through `points`: Catmull-Rom segments drawn as cubic Béziers. */
export function smoothPath(points: Point[]): string {
  const start = points.at(0);
  if (start === undefined) {
    return '';
  }
  const parts = [`M${round(start.x)} ${round(start.y)}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p1 = points[index] ?? start;
    const p0 = points[index - 1] ?? p1;
    const p2 = points[index + 1] ?? p1;
    const p3 = points[index + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    parts.push(
      `C${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(p2.x)} ${round(p2.y)}`,
    );
  }
  return parts.join(' ');
}

/** Columns and rows from dagre's positions: equal x is one column, ordered top to bottom. */
function ranked(centers: Map<string, Point>): Map<string, { rank: number; order: number }> {
  const columns = [...new Set([...centers.values()].map(point => round(point.x)))].toSorted(
    (a, b) => a - b,
  );
  const places = new Map<string, { rank: number; order: number }>();
  for (const [rank, x] of columns.entries()) {
    const column = [...centers]
      .filter(([, point]) => round(point.x) === x)
      .toSorted((a, b) => a[1].y - b[1].y);
    for (const [order, [id]] of column.entries()) {
      places.set(id, { rank, order });
    }
  }
  return places;
}

function buildGraph(nodes: string[], edges: LayoutEdgeInput[]): DagreGraph {
  const graph = new dagre.Graph();
  graph.setGraph({
    rankdir: 'LR',
    nodesep: GAP_Y,
    ranksep: GAP_X,
    marginx: MARGIN,
    marginy: MARGIN,
    acyclicer: 'greedy',
    ranker: 'network-simplex',
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const id of nodes) {
    graph.setNode(id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    graph.setEdge(edge.from, edge.to, {
      width: LABEL_WIDTH,
      height: LABEL_HEIGHT,
      labelpos: 'c',
      weight: edge.weight ?? 1,
    });
  }
  dagre.layout(graph);
  return graph;
}

/** Positions for every node and a path for every edge. Self-edges and unknown nodes are dropped. */
export function layoutGraph(nodeIds: string[], input: LayoutEdgeInput[]): Layout {
  const nodes = [...new Set(nodeIds)];
  const known = new Set(nodes);
  const seen = new Set<string>();
  const edges = input.filter(edge => {
    const key = `${edge.from}\0${edge.to}`;
    const keep =
      edge.from !== edge.to && known.has(edge.from) && known.has(edge.to) && !seen.has(key);
    seen.add(key);
    return keep;
  });
  const graph = buildGraph(nodes, edges);
  const centers = new Map(nodes.map(id => [id, graph.node(id)]));
  const places = ranked(centers);
  const laidOut = edges.map((edge): LayoutEdge => {
    const label = graph.edge(edge.from, edge.to);
    const first = label.points.at(0);
    const last = label.points.at(-1);
    return {
      from: edge.from,
      to: edge.to,
      reversed: first !== undefined && last !== undefined && last.x < first.x,
      path: smoothPath(label.points),
      labelX: round(label.x),
      labelY: round(label.y),
    };
  });
  const size = graph.graph();
  return {
    nodes: nodes.map(id => {
      const center = centers.get(id) ?? { x: 0, y: 0 };
      return {
        id,
        rank: places.get(id)?.rank ?? 0,
        order: places.get(id)?.order ?? 0,
        x: round(center.x - NODE_WIDTH / 2),
        y: round(center.y - NODE_HEIGHT / 2),
      };
    }),
    edges: laidOut,
    width: round(size.width ?? 0),
    height: round(size.height ?? 0),
  };
}
