import { existsSync, writeFileSync } from 'node:fs';

import { relative } from 'pathe';

import { isRuleName } from '#src/config/rules.ts';
import { LayerscopeError } from '#src/errors.ts';
import type { AnalyzeResult, BaselineEntry, BaselineResult, Finding } from '#src/types.ts';
import { readJson } from '#src/utils/fs.ts';
import { compareStrings } from '#src/utils/strings.ts';

export const BASELINE_FILE = 'layerscope-baseline.json';

/** Bumped on breaking changes to the baseline file. */
export const BASELINE_VERSION = 1;

export interface Baseline {
  version: typeof BASELINE_VERSION;
  entries: BaselineEntry[];
}

type Keyed = Pick<BaselineEntry, 'rule' | 'file' | 'symbol' | 'toLayer'>;

/** Rule, file, symbol and target layer; lines are left out so unrelated edits keep the entry. */
function keyOf(entry: Keyed): string {
  return [entry.rule, entry.file, entry.symbol, entry.toLayer ?? ''].join('\0');
}

function toKeyed(finding: Finding, rootDir: string): Keyed {
  return {
    rule: finding.rule,
    file: relative(rootDir, finding.file),
    symbol: finding.symbol,
    toLayer: finding.toLayer,
  };
}

function compareEntries(a: Keyed, b: Keyed): number {
  return (
    compareStrings(a.file, b.file) ||
    compareStrings(a.rule, b.rule) ||
    compareStrings(a.symbol, b.symbol) ||
    compareStrings(a.toLayer ?? '', b.toLayer ?? '')
  );
}

export function createBaseline(findings: Finding[], rootDir: string): Baseline {
  const entries = new Map<string, BaselineEntry>();
  for (const finding of findings) {
    const keyed = toKeyed(finding, rootDir);
    const key = keyOf(keyed);
    const entry = entries.get(key);
    if (entry === undefined) {
      entries.set(key, keyed);
    } else {
      entry.count = (entry.count ?? 1) + 1;
    }
  }
  return { version: BASELINE_VERSION, entries: [...entries.values()].toSorted(compareEntries) };
}

interface Diff {
  added: BaselineEntry[];
  fixed: BaselineEntry[];
}

export function writeBaseline(file: string, baseline: Baseline): void {
  writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`);
}

function isEntry(value: unknown): value is BaselineEntry {
  const entry = value as Partial<BaselineEntry> | null;
  return (
    typeof entry === 'object' &&
    entry !== null &&
    typeof entry.rule === 'string' &&
    isRuleName(entry.rule) &&
    typeof entry.file === 'string' &&
    typeof entry.symbol === 'string' &&
    (entry.toLayer === null || typeof entry.toLayer === 'string')
  );
}

export function parseBaseline(value: unknown, file: string): Baseline {
  const baseline = value as Partial<Baseline> | null;
  if (baseline?.version !== BASELINE_VERSION || !Array.isArray(baseline.entries)) {
    throw new LayerscopeError(
      `${file} is not a layerscope baseline (version ${BASELINE_VERSION}). Recreate it with --update-baseline.`,
    );
  }
  const invalid = baseline.entries.findIndex(entry => !isEntry(entry));
  if (invalid !== -1) {
    throw new LayerscopeError(`${file}: entry ${invalid} is not a valid baseline entry`);
  }
  return { version: BASELINE_VERSION, entries: baseline.entries };
}

export function readBaseline(file: string): Baseline | null {
  return existsSync(file) ? parseBaseline(readJson(file), file) : null;
}

export function baselineSize(entries: BaselineEntry[]): number {
  return entries.reduce((sum, entry) => sum + (entry.count ?? 1), 0);
}

function surplus(entries: BaselineEntry[], other: BaselineEntry[]): BaselineEntry[] {
  const known = new Map(other.map(entry => [keyOf(entry), entry.count ?? 1]));
  return entries.flatMap(entry => {
    const extra = (entry.count ?? 1) - (known.get(keyOf(entry)) ?? 0);
    return extra > 0 ? [{ ...entry, count: extra }] : [];
  });
}

/** `added` is what `current` has beyond `base`, `fixed` the other way round. */
export function diffBaselines(base: Baseline, current: Baseline): Diff {
  return {
    added: surplus(current.entries, base.entries),
    fixed: surplus(base.entries, current.entries),
  };
}

/** Findings missing from the baseline stay; the rest are suppressed, up to each entry's count. */
export function applyBaseline(
  findings: Finding[],
  baseline: Baseline,
  file: string,
  rootDir: string,
): { findings: Finding[]; baseline: BaselineResult } {
  const remaining = new Map(
    baseline.entries.map(entry => [keyOf(entry), { entry, left: entry.count ?? 1 }]),
  );
  const fresh: Finding[] = [];
  const suppressed: Finding[] = [];
  for (const finding of findings) {
    const slot = remaining.get(keyOf(toKeyed(finding, rootDir)));
    if (slot === undefined || slot.left === 0) {
      fresh.push(finding);
    } else {
      slot.left -= 1;
      suppressed.push(finding);
    }
  }
  const removable = [...remaining.values()].flatMap(({ entry, left }) =>
    left === 0 ? [] : [left === (entry.count ?? 1) ? entry : { ...entry, count: left }],
  );
  return { findings: fresh, baseline: { file, suppressed, removable } };
}

/** The result with the baseline applied, or unchanged when the file does not exist. */
export function applyBaselineFile(result: AnalyzeResult, file: string): AnalyzeResult {
  const baseline = readBaseline(file);
  return baseline === null
    ? result
    : { ...result, ...applyBaseline(result.findings, baseline, file, result.rootDir) };
}
