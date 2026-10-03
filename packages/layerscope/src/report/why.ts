import { relative } from 'pathe';

import type { Edge } from '#src/types.ts';
import type { SymbolTarget, SymbolUse, UseStatus } from '#src/why/index.ts';

import { JSON_REPORT_VERSION } from './json.ts';

export const WHY_FORMATS = ['text', 'json'] as const;

export type WhyFormat = (typeof WHY_FORMATS)[number];

export const STATUS_LABELS: Record<UseStatus, string> = {
  'same-layer': '✔ same layer',
  external: '✔ external',
  unrestricted: '✔ unrestricted',
  allowed: '✔ allowed',
  'not-allowed': '✖ not allowed',
};

export function isWhyFormat(value: string): value is WhyFormat {
  return (WHY_FORMATS as readonly string[]).includes(value);
}

function describeTarget(target: SymbolTarget, cwd: string): string {
  if (target.file === null) {
    return `${target.external ?? 'unknown'} (external)`;
  }
  return `${relative(cwd, target.file)} (${target.layer ?? 'no layer'})`;
}

function formatTargetText(target: SymbolTarget, cwd: string): string {
  const rows = target.uses.map(({ edge, status }) => ({
    location: `${relative(cwd, edge.file)}:${edge.line}:${edge.column}`,
    path: `${edge.fromLayer} → ${edge.toLayer ?? edge.external ?? 'unknown'}`,
    status: STATUS_LABELS[status],
  }));
  const locationWidth = Math.max(...rows.map(row => row.location.length));
  const pathWidth = Math.max(...rows.map(row => row.path.length));
  const lines = rows.map(
    row =>
      `  ${row.location.padEnd(locationWidth)}   ${row.path.padEnd(pathWidth)}   ${row.status}`,
  );
  return [`${target.symbol} → ${describeTarget(target, cwd)}`, ...lines].join('\n');
}

export interface WhyUseRow {
  file: string;
  /** Set with `absolute`, for opening the file in an editor. */
  absFile?: string;
  line: number;
  column: number;
  kind: Edge['kind'];
  symbol: string;
  fromLayer: string;
  toLayer: string | null;
  status: UseStatus;
}

export interface WhyTargetRow {
  symbol: string;
  file: string | null;
  absFile?: string | null;
  layer: string | null;
  external: string | null;
  uses: WhyUseRow[];
}

export interface WhyReport {
  version: typeof JSON_REPORT_VERSION;
  symbol: string;
  targets: WhyTargetRow[];
}

function useRow({ edge, status }: SymbolUse, cwd: string, absolute: boolean): WhyUseRow {
  return {
    file: relative(cwd, edge.file),
    ...(absolute && { absFile: edge.file }),
    line: edge.line,
    column: edge.column,
    kind: edge.kind,
    symbol: edge.symbol,
    fromLayer: edge.fromLayer,
    toLayer: edge.toLayer,
    status,
  };
}

/** `why --format json`, as data; with `absolute`, paths also come as absolute paths. */
export function toWhyReport(
  query: string,
  targets: SymbolTarget[],
  cwd: string,
  absolute = false,
): WhyReport {
  return {
    version: JSON_REPORT_VERSION,
    symbol: query,
    targets: targets.map(target => ({
      symbol: target.symbol,
      file: target.file === null ? null : relative(cwd, target.file),
      ...(absolute && { absFile: target.file }),
      layer: target.layer,
      external: target.external,
      uses: target.uses.map(use => useRow(use, cwd, absolute)),
    })),
  };
}

function formatWhyJson(query: string, targets: SymbolTarget[], cwd: string): string {
  return `${JSON.stringify(toWhyReport(query, targets, cwd), null, 2)}\n`;
}

export function formatWhy(
  query: string,
  targets: SymbolTarget[],
  format: WhyFormat,
  cwd: string = process.cwd(),
): string {
  if (format === 'json') {
    return formatWhyJson(query, targets, cwd);
  }
  return `${targets.map(target => formatTargetText(target, cwd)).join('\n\n')}\n`;
}
