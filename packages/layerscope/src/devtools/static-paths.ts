/**
 * Where each answer of the tab is in a static snapshot, relative to the tab's base. The writer and
 * the client's demo mode both use these, so the two cannot disagree.
 */

const part = (value: string): string => encodeURIComponent(value);

export const STATIC_PATHS = {
  state: 'api/state.json',
  report: 'api/report.json',
  symbols: 'api/symbols.json',
  unused: 'api/unused.json',
  baseline: 'api/baseline.json',
  graph: 'api/graph.json',
  /** The `check --format json` report, as `?format=json` gives it. */
  checkReport: 'report.json',
} as const;

export function edgePath(from: string, to: string): string {
  return `api/edge/${part(from)}/${part(to)}.json`;
}

/** All files of the layer in one file: a snapshot has no paging. */
export function nodePath(layer: string): string {
  return `api/node/${part(layer)}.json`;
}

/** The file name of a symbol's trace on disk. */
export function tracePath(symbol: string): string {
  return `api/trace/${part(symbol)}.json`;
}

/**
 * The URL of a symbol's trace. A static host decodes `%xx` before it looks for the file, so a name
 * that encoding changes, such as `$fetch` (`%24fetch.json` on disk), is encoded twice.
 */
export function traceUrl(symbol: string): string {
  return `api/trace/${part(part(symbol))}.json`;
}
