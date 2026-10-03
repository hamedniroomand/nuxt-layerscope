import { relative } from 'pathe';

import { createOwnerLookup } from '#src/nuxt/owner.ts';
import type { AnalyzeResult, Context } from '#src/types.ts';
import { compareStrings } from '#src/utils/strings.ts';

import { findingKey } from './finding-keys.ts';
import { edgeView, graphView, LAYOUT_LIMIT, nodeView } from './graph-api.ts';
import type { BaselineView, SymbolEntry, TraceView, UnusedView } from './protocol.ts';

const CONTEXTS: Context[] = ['app', 'server', 'shared'];
const LAZY = /^Lazy[A-Z]/u;

/** Names the trace accepts: components without `Lazy`, then auto-imports with their contexts. */
export function listSymbols(result: AnalyzeResult): SymbolEntry[] {
  const ownerOf = createOwnerLookup(result.layers);
  const layerOf = (file: string | null): string | null =>
    file === null ? null : (ownerOf(file)?.name ?? null);
  const entries = new Map<string, SymbolEntry>();
  for (const [name, target] of result.symbols.components) {
    if (!LAZY.test(name)) {
      entries.set(`component:${name}`, {
        name,
        kind: 'component',
        layer: layerOf(target.file),
        contexts: [],
      });
    }
  }
  for (const context of CONTEXTS) {
    for (const [name, target] of result.symbols.imports[context]) {
      const key = `auto-import:${name}`;
      const entry = entries.get(key) ?? {
        name,
        kind: 'auto-import',
        layer: layerOf(target.file),
        contexts: [],
      };
      entry.contexts.push(context);
      entries.set(key, entry);
    }
  }
  return [...entries.values()].toSorted(
    (a, b) => compareStrings(a.name, b.name) || compareStrings(a.kind, b.kind),
  );
}

/** Every use of `symbol`, as `layerscope why` reports it, with absolute paths for the editor. */
export async function traceView(result: AnalyzeResult, symbol: string): Promise<TraceView> {
  const [{ findUses }, { toWhyReport }] = await Promise.all([
    import('#src/why/index.ts'),
    import('#src/report/why.ts'),
  ]);
  const targets = symbol === '' ? [] : findUses(result, symbol, result.config);
  return toWhyReport(symbol, targets, result.rootDir, true);
}

/** Unused components and auto-imports, as `layerscope unused` reports them. */
export async function unusedView(result: AnalyzeResult): Promise<UnusedView> {
  const [{ findUnused }, { toUnusedRows }] = await Promise.all([
    import('#src/unused/index.ts'),
    import('#src/report/unused.ts'),
  ]);
  const rows = toUnusedRows(findUnused(result), result.rootDir, true);
  return {
    unused: rows,
    possiblyUsed: rows.some(row => row.possiblyUsed),
    layers: result.layers.map(layer => layer.name),
  };
}

/** The baseline the analysis applied: suppressed findings, keyed like live ones, and stale entries. */
export function baselineView(result: AnalyzeResult): BaselineView {
  const { baseline, rootDir } = result;
  if (baseline === undefined) {
    return { file: null, suppressed: [], removable: [] };
  }
  return {
    file: relative(rootDir, baseline.file),
    suppressed: baseline.suppressed.map(finding => ({
      ...finding,
      file: relative(rootDir, finding.file),
      target: finding.target === null ? null : relative(rootDir, finding.target),
      absFile: finding.file,
      absTarget: finding.target,
      key: findingKey(finding, rootDir),
      isNew: false,
    })),
    removable: baseline.removable,
  };
}

export const VIEW_PATHS = [
  '/api/symbols',
  '/api/trace',
  '/api/unused',
  '/api/baseline',
  '/api/graph',
  '/api/edge',
  '/api/node',
];

export type ViewQuery = Partial<
  Record<'symbol' | 'from' | 'to' | 'layer' | 'offset' | 'layout', string>
>;

async function graphBody(
  path: string,
  result: AnalyzeResult,
  query: ViewQuery,
): Promise<object | null> {
  if (path === '/api/graph') {
    const graph = await graphView(
      result,
      query.layout === '1' || result.layers.length <= LAYOUT_LIMIT,
    );
    return graph;
  }
  const known = new Set(result.layers.map(layer => layer.name));
  if (path === '/api/edge') {
    const { from = '', to = '' } = query;
    return known.has(from) && known.has(to) ? edgeView(result, from, to) : null;
  }
  const offset = Math.max(0, Math.trunc(Number(query.offset ?? '0')) || 0);
  return nodeView(result, query.layer ?? '', offset);
}

/**
 * The body of a view endpoint, or `null` for a layer that does not exist. All read the cached
 * snapshot and never re-analyze.
 */
export async function viewBody(
  path: string,
  result: AnalyzeResult,
  query: ViewQuery,
): Promise<object | null> {
  if (path === '/api/symbols') {
    return { symbols: listSymbols(result) };
  }
  if (path === '/api/trace') {
    const trace = await traceView(result, query.symbol ?? '');
    return trace;
  }
  if (path === '/api/unused') {
    const unused = await unusedView(result);
    return unused;
  }
  if (path === '/api/baseline') {
    return baselineView(result);
  }
  const body = await graphBody(path, result, query);
  return body;
}
