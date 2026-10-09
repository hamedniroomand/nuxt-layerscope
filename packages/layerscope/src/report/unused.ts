import { relative } from 'pathe';

import type { UnusedSymbol } from '#src/unused/index.ts';
import { plural } from '#src/utils/strings.ts';

import { JSON_REPORT_VERSION } from './json.ts';

export const UNUSED_FORMATS = ['text', 'json'] as const;

export type UnusedFormat = (typeof UNUSED_FORMATS)[number];

export function isUnusedFormat(value: string): value is UnusedFormat {
  return (UNUSED_FORMATS as readonly string[]).includes(value);
}

function describe(symbol: UnusedSymbol): string {
  const exposed = symbol.exposed ? ', exposed' : '';
  if (symbol.kind === 'component') {
    return symbol.possiblyUsed
      ? `component (possibly used at runtime${exposed})`
      : `component${symbol.exposed ? ' (exposed)' : ''}`;
  }
  return `auto-import (${symbol.context ?? 'app'}${exposed})`;
}

function formatUnusedText(unused: UnusedSymbol[], cwd: string): string {
  if (unused.length === 0) {
    return '✔ Every component and auto-import is referenced\n';
  }
  const rows = unused.map(symbol => ({ symbol, file: relative(cwd, symbol.file) }));
  const nameWidth = Math.max(...rows.map(row => row.symbol.name.length));
  const fileWidth = Math.max(...rows.map(row => row.file.length));
  const byLayer = Map.groupBy(rows, row => row.symbol.layer);
  const sections = [...byLayer].map(([layer, layerRows]) =>
    [
      layer,
      ...layerRows.map(
        ({ symbol, file }) =>
          `  ${symbol.name.padEnd(nameWidth)}  ${file.padEnd(fileWidth)}  ${describe(symbol)}`,
      ),
    ].join('\n'),
  );
  const footer = `${plural(unused.length, 'unused symbol')} in ${plural(byLayer.size, 'layer')}`;
  return `${[...sections, footer].join('\n\n')}\n`;
}

export interface UnusedRow extends UnusedSymbol {
  /** Set with `absolute`, for opening the file in an editor. */
  absFile?: string;
}

/** `unused --format json` rows; with `absolute`, each row also carries the absolute path. */
export function toUnusedRows(unused: UnusedSymbol[], cwd: string, absolute = false): UnusedRow[] {
  return unused.map(symbol => ({
    ...symbol,
    file: relative(cwd, symbol.file),
    ...(absolute && { absFile: symbol.file }),
  }));
}

function formatUnusedJson(unused: UnusedSymbol[], cwd: string): string {
  const report = { version: JSON_REPORT_VERSION, unused: toUnusedRows(unused, cwd) };
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function formatUnused(
  unused: UnusedSymbol[],
  format: UnusedFormat,
  cwd: string = process.cwd(),
): string {
  return format === 'json' ? formatUnusedJson(unused, cwd) : formatUnusedText(unused, cwd);
}
