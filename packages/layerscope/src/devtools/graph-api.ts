import { relative } from 'pathe';

import { buildGraph } from '#src/graph/index.ts';
import { layoutGraph } from '#src/graph/layout.ts';
import { createOwnerLookup } from '#src/nuxt/owner.ts';
import { edgeStatus } from '#src/rules/edge-status.ts';
import type { AnalyzeResult, Edge, Finding } from '#src/types.ts';
import { compareStrings } from '#src/utils/strings.ts';

import type { EdgeView, GraphView, MatrixCell, NodeView } from './protocol.ts';
import { layerStats } from './stats.ts';

const EDGE_ROWS = 500;
const NODE_PAGE = 200;

function pairKey(from: string, to: string | null): string {
  return `${from}\0${to ?? ''}`;
}

/** Findings and their worst severity per layer pair, so edge badges match the Findings list. */
function violationsByPair(findings: Finding[]): Map<string, { count: number; error: boolean }> {
  const pairs = new Map<string, { count: number; error: boolean }>();
  for (const finding of findings) {
    if (finding.toLayer === null || finding.toLayer === finding.fromLayer) {
      continue;
    }
    const key = pairKey(finding.fromLayer, finding.toLayer);
    const entry = pairs.get(key) ?? { count: 0, error: false };
    entry.count += 1;
    entry.error ||= finding.severity === 'error';
    pairs.set(key, entry);
  }
  return pairs;
}

/** The layer graph with counts, the matrix built from the same edges, and the layout. */
export function graphView(result: AnalyzeResult): GraphView {
  const graph = buildGraph(result, result.config, 'layer');
  const pairs = violationsByPair(result.findings);
  const edges = graph.edges.map(({ from, to, count, status }) => {
    const pair = pairs.get(pairKey(from, to));
    const severity =
      pair === undefined ? null : pair.error ? ('error' as const) : ('warn' as const);
    return { from, to, count, status, violations: pair?.count ?? 0, severity };
  });
  const layers = result.layers.map(layer => layer.name);
  const byPair = new Map(edges.map(edge => [pairKey(edge.from, edge.to), edge]));
  const cells = layers.map(from =>
    layers.map((to): MatrixCell => {
      const edge = byPair.get(pairKey(from, to));
      return edge === undefined
        ? { count: 0, status: null, violations: 0 }
        : { count: edge.count, status: edge.status, violations: edge.violations };
    }),
  );
  return {
    nodes: layerStats(result).map(({ name, root, allow, files, refsIn, refsOut }) => ({
      id: name,
      name,
      root,
      allow,
      files,
      refsIn,
      refsOut,
    })),
    edges,
    matrix: { layers, cells },
    layout: layoutGraph(layers, edges),
  };
}

/** The name an edge is known by: `#imports:useCart` is `useCart`. */
function edgeName(edge: Edge): string {
  return /^#(?:imports|components):(.+)$/u.exec(edge.symbol)?.[1] ?? edge.symbol;
}

/** The references behind one edge, grouped by symbol, at most 500 rows. */
export function edgeView(result: AnalyzeResult, from: string, to: string): EdgeView {
  const uses = result.edges.filter(edge => edge.fromLayer === from && edge.toLayer === to);
  const shown = uses.slice(0, EDGE_ROWS);
  const symbols = new Map<string, EdgeView['symbols'][number]>();
  for (const edge of shown) {
    const name = edgeName(edge);
    const group = symbols.get(name) ?? { symbol: name, kind: edge.kind, count: 0, rows: [] };
    group.count += 1;
    group.rows.push({
      file: relative(result.rootDir, edge.file),
      absFile: edge.file,
      line: edge.line,
      column: edge.column,
      status: edgeStatus(edge, result.config),
    });
    symbols.set(name, group);
  }
  const statuses = new Set(uses.map(edge => edgeStatus(edge, result.config)));
  return {
    from,
    to,
    status: statuses.has('not-allowed') ? 'not-allowed' : ([...statuses][0] ?? null),
    total: uses.length,
    truncated: Math.max(0, uses.length - EDGE_ROWS),
    symbols: [...symbols.values()].toSorted(
      (a, b) => b.count - a.count || compareStrings(a.symbol, b.symbol),
    ),
  };
}

function tally(items: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return counts;
}

function countBy(items: string[]): { layer: string; count: number }[] {
  return [...tally(items)]
    .map(([layer, count]) => ({ layer, count }))
    .toSorted((a, b) => b.count - a.count || compareStrings(a.layer, b.layer));
}

/** One layer: its stats, the layers it uses and is used by, and a page of its files. */
export function nodeView(result: AnalyzeResult, layer: string, offset = 0): NodeView | null {
  const stat = layerStats(result).find(entry => entry.name === layer);
  if (stat === undefined) {
    return null;
  }
  const ownerOf = createOwnerLookup(result.layers);
  const crossing = result.edges.filter(
    edge => edge.toLayer !== null && edge.toLayer !== edge.fromLayer,
  );
  const outgoing = crossing.filter(edge => edge.fromLayer === layer);
  const incoming = crossing.filter(edge => edge.toLayer === layer);
  const outOf = tally(outgoing.map(edge => edge.file));
  const inOf = tally(incoming.map(edge => edge.to ?? ''));
  const files = result.files
    .filter(file => ownerOf(file)?.name === layer)
    .toSorted(compareStrings)
    .map(file => ({
      file: relative(result.rootDir, file),
      absFile: file,
      refsOut: outOf.get(file) ?? 0,
      refsIn: inOf.get(file) ?? 0,
    }));
  return {
    layer: stat,
    in: countBy(incoming.map(edge => edge.fromLayer)),
    out: countBy(outgoing.map(edge => edge.toLayer ?? '')),
    files: files.slice(offset, offset + NODE_PAGE),
    total: files.length,
    offset,
  };
}
