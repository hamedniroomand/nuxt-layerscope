import { relative } from 'pathe';

import type { BlindSpot } from '#src/unused/blind-spots.ts';
import type { UnusedSymbol } from '#src/unused/index.ts';
import { plural } from '#src/utils/strings.ts';

import { JSON_REPORT_VERSION } from './json.ts';

export const UNUSED_FORMATS = ['text', 'json'] as const;

export type UnusedFormat = (typeof UNUSED_FORMATS)[number];

export function isUnusedFormat(value: string): value is UnusedFormat {
  return (UNUSED_FORMATS as readonly string[]).includes(value);
}

/** The kind, the context and the marks of an unused symbol, as the text report shows them. */
export function unusedLabel(symbol: UnusedSymbol): string {
  const exposed = symbol.exposed ? ', exposed' : '';
  if (symbol.kind === 'component') {
    const kind = symbol.global ? 'global component' : 'component';
    return symbol.possiblyUsed
      ? `${kind} (possibly used at runtime${exposed})`
      : `${kind}${symbol.exposed ? ' (exposed)' : ''}`;
  }
  return `auto-import (${symbol.context ?? 'app'}${exposed})`;
}

const NUXT_CONTENT =
  'Nuxt Content can render any component by its name from a content file, so every component is marked "possibly used at runtime".';

const NOT_COUNTED: Record<'test-files' | 'ignored' | 'package-layers', string> = {
  'test-files': 'test files',
  ignored: 'files matched by "ignore"',
  'package-layers': 'files in layers installed as packages',
};

/**
 * The lines that name what `unused` does not see. The first names the uses that it does not
 * count, the second the layers outside the project root that it does not list, the third says
 * why Nuxt Content marks every component. A line is left out when nothing applies to it.
 */
export function blindSpotLines(spots: BlindSpot[]): string[] {
  const parts = spots.flatMap(spot =>
    spot.kind === 'unreadable' || spot.kind === 'outside-root' || spot.kind === 'nuxt-content'
      ? []
      : [NOT_COUNTED[spot.kind]],
  );
  const lines = parts.length === 0 ? [] : [`Not counted as uses: ${parts.join(', ')}.`];
  for (const spot of spots) {
    if (spot.kind === 'outside-root') {
      lines.push(`Not listed (layers outside the project root): ${spot.layers.join(', ')}.`);
    }
  }
  if (spots.some(spot => spot.kind === 'nuxt-content')) {
    lines.push(NUXT_CONTENT);
  }
  return lines;
}

function unreadableOf(spots: BlindSpot[]): { file: string; reason: string }[] {
  return spots.flatMap(spot => (spot.kind === 'unreadable' ? spot.files : []));
}

/** How many files could not be read in these blind spots. */
export function countUnreadable(spots: BlindSpot[]): number {
  return unreadableOf(spots).length;
}

export interface BlindSpotRow {
  kind: BlindSpot['kind'];
  /** Only for `unreadable`. */
  files?: { file: string; reason: string; absFile?: string }[];
  /** Only for `outside-root`. */
  layers?: string[];
}

/** The blind spots with files relative to `cwd`; with `absolute`, each file keeps its full path. */
export function toBlindSpotRows(spots: BlindSpot[], cwd: string, absolute = false): BlindSpotRow[] {
  return spots.map(spot =>
    spot.kind === 'unreadable'
      ? {
          kind: spot.kind,
          files: spot.files.map(({ file, reason }) => ({
            file: relative(cwd, file),
            reason,
            ...(absolute && { absFile: file }),
          })),
        }
      : spot.kind === 'outside-root'
        ? { kind: spot.kind, layers: spot.layers }
        : { kind: spot.kind },
  );
}

function unreadableText(files: { file: string; reason: string }[], cwd: string): string[] {
  if (files.length === 0) {
    return [];
  }
  const rows = files.map(({ file, reason }) => ({ file: relative(cwd, file), reason }));
  const width = Math.max(...rows.map(row => row.file.length));
  return [
    [
      'Files that could not be read in full:',
      ...rows.map(row => `  ${row.file.padEnd(width)}  ${row.reason}`),
    ].join('\n'),
  ];
}

/** The sentence about files that could not be read in full; `null` when there are none. */
export function unreadableSentence(count: number): string | null {
  if (count === 0) {
    return null;
  }
  return count === 1
    ? '1 file could not be read in full, so some of its uses can be missing.'
    : `${count} files could not be read in full, so some of their uses can be missing.`;
}

/**
 * Whether some symbols were not checked: a layer installed as a package, or a layer outside the
 * project root. Then "no unused symbol" is about the listed layers only.
 */
function isScoped(spots: BlindSpot[]): boolean {
  return spots.some(spot => spot.kind === 'package-layers' || spot.kind === 'outside-root');
}

const SCOPED = 'No unused symbol found in the listed layers.';

/** The sentence for the Unused view when nothing is listed and every file was read. */
export function emptySentence(spots: BlindSpot[]): string {
  return isScoped(spots) ? SCOPED : 'Every component and auto-import is referenced.';
}

function noUnusedText(unreadable: number, spots: BlindSpot[]): string {
  const sentence = unreadableSentence(unreadable);
  const scoped = isScoped(spots);
  if (sentence === null) {
    return scoped ? SCOPED : '✔ Every component and auto-import is referenced';
  }
  return `${scoped ? SCOPED : 'No unused symbol found.'} ${sentence}`;
}

function formatUnusedText(unused: UnusedSymbol[], cwd: string, spots: BlindSpot[]): string {
  const unreadable = unreadableOf(spots);
  const lines = blindSpotLines(spots);
  // The lines of the blind spots stay together, one after the other.
  const tail = [
    ...unreadableText(unreadable, cwd),
    ...(lines.length === 0 ? [] : [lines.join('\n')]),
  ];
  if (unused.length === 0) {
    return `${[noUnusedText(unreadable.length, spots), ...tail].join('\n\n')}\n`;
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
          `  ${symbol.name.padEnd(nameWidth)}  ${file.padEnd(fileWidth)}  ${unusedLabel(symbol)}`,
      ),
    ].join('\n'),
  );
  const footer = `${plural(unused.length, 'unused symbol')} in ${plural(byLayer.size, 'layer')}`;
  return `${[...sections, footer, ...tail].join('\n\n')}\n`;
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

function formatUnusedJson(unused: UnusedSymbol[], cwd: string, spots: BlindSpot[]): string {
  const report = {
    version: JSON_REPORT_VERSION,
    unused: toUnusedRows(unused, cwd),
    blindSpots: toBlindSpotRows(spots, cwd),
  };
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function formatUnused(
  unused: UnusedSymbol[],
  format: UnusedFormat,
  cwd: string,
  blindSpots: BlindSpot[],
): string {
  return format === 'json'
    ? formatUnusedJson(unused, cwd, blindSpots)
    : formatUnusedText(unused, cwd, blindSpots);
}
