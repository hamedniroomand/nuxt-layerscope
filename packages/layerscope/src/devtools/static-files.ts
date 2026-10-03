import type { AnalyzeResult } from '#src/types.ts';

import type { NodeView, ReportResponse, SymbolEntry } from './protocol.ts';
import { tabReport } from './report.ts';
import { STATIC_PATHS, edgePath, nodePath, tracePath } from './static-paths.ts';
import type { ViewQuery } from './views-api.ts';

export interface StaticFile {
  path: string;
  body: unknown;
}

export interface StaticContext {
  /** Per finding, in report order. */
  keys: string[];
  analyzedAt: number;
  durationMs: number;
  version: string;
  view: (path: string, query: ViewQuery) => Promise<object | null>;
}

/** Every page of a layer in one view, since a snapshot cannot page. */
async function wholeNode(
  context: StaticContext,
  layer: string,
  offset = 0,
): Promise<NodeView | null> {
  const page = (await context.view('/api/node', {
    layer,
    offset: String(offset),
  })) as NodeView | null;
  const next = offset + (page?.files.length ?? 0);
  if (page === null || page.files.length === 0 || next >= page.total) {
    return page;
  }
  const rest = await wholeNode(context, layer, next);
  return { ...page, files: [...page.files, ...(rest?.files ?? [])] };
}

async function reportFiles(result: AnalyzeResult, context: StaticContext): Promise<StaticFile[]> {
  const { formatResult } = await import('#src/report/index.ts');
  const meta = {
    id: 'snapshot',
    rev: 0,
    marker: 0,
    analyzedAt: context.analyzedAt,
    durationMs: context.durationMs,
  };
  const marks = { keys: context.keys, isNew: context.keys.map(() => false) };
  const report: ReportResponse = { ...meta, report: await tabReport(result, marks) };
  return [
    {
      path: STATIC_PATHS.state,
      body: {
        ...meta,
        status: 'ready',
        live: { clients: 0, paused: true },
        version: context.version,
      },
    },
    { path: STATIC_PATHS.report, body: report },
    {
      path: STATIC_PATHS.checkReport,
      body: JSON.parse(formatResult(result, 'json', result.rootDir)) as unknown,
    },
  ];
}

/**
 * Runs `run` for each item, one after another. The views load their report code on first use,
 * and Nuxt loads this module through jiti, where parallel first loads of the same file can see it
 * half evaluated. The answers are cheap, so the order costs little.
 */
async function inOrder<T, R>(items: readonly T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  const next = async (index: number): Promise<R[]> => {
    if (index >= items.length) {
      return results;
    }
    results.push(await run(items[index] as T));
    return next(index + 1);
  };
  const all = await next(0);
  return all;
}

function edgePairs(result: AnalyzeResult): [string, string][] {
  const keys = result.edges
    .filter(edge => edge.toLayer !== null && edge.toLayer !== edge.fromLayer)
    .map(edge => `${edge.fromLayer}\0${edge.toLayer}`);
  return [...new Set(keys)].map(key => {
    const [from = '', to = ''] = key.split('\0');
    return [from, to];
  });
}

/** The files of a snapshot: one for each answer the tab can ask for, with the same bodies. */
export async function staticFiles(
  result: AnalyzeResult,
  context: StaticContext,
): Promise<StaticFile[]> {
  const fixed = await inOrder(['symbols', 'unused', 'baseline'] as const, async name => ({
    path: STATIC_PATHS[name],
    body: await context.view(`/api/${name}`, {}),
  }));
  const graph = {
    path: STATIC_PATHS.graph,
    body: await context.view('/api/graph', { layout: '1' }),
  };
  const listed = fixed[0]?.body as { symbols: SymbolEntry[] } | undefined;
  const names = [...new Set((listed?.symbols ?? []).map(symbol => symbol.name))];
  const traces = await inOrder(names, async symbol => ({
    path: tracePath(symbol),
    body: await context.view('/api/trace', { symbol }),
  }));
  const edges = await inOrder(edgePairs(result), async ([from, to]) => ({
    path: edgePath(from, to),
    body: await context.view('/api/edge', { from, to }),
  }));
  const nodes = await inOrder(result.layers, async layer => ({
    path: nodePath(layer.name),
    body: await wholeNode(context, layer.name),
  }));
  return [...(await reportFiles(result, context)), ...fixed, graph, ...traces, ...edges, ...nodes];
}
