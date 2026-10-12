import { writeFileSync } from 'node:fs';

import { relative } from 'pathe';

import { isRuleName } from '#src/config/rules.ts';
import { LayerscopeError } from '#src/errors.ts';
import type { AnalyzeResult, BaselineEntry, BaselineResult, Finding } from '#src/types.ts';
import { parseJson } from '#src/utils/fs.ts';
import { compareStrings } from '#src/utils/strings.ts';

import {
  BASELINE_VERSION,
  checkVersion,
  FILE_ADVICE,
  hasBadCount,
  isCount,
  readBaselineText,
} from './input.ts';

export {
  assertBaselineName,
  assertBaselineOption,
  assertNotDirectory,
  BASELINE_FILE,
  BASELINE_VERSION,
} from './input.ts';

export interface Baseline {
  version: typeof BASELINE_VERSION;
  entries: BaselineEntry[];
}

export type Keyed = Pick<BaselineEntry, 'rule' | 'file' | 'symbol' | 'toLayer'>;

/**
 * Rule, file, symbol and target layer; lines are left out so unrelated edits keep the entry. A
 * `layer-cycle` finding is shown at its first use, and that file changes when a use is added or
 * removed, so its key has no file. The target layer is the second layer of the chain. It stays in
 * the key, so two chains with the same joined symbol are not the same cycle.
 */
export function keyOf(entry: Keyed): string {
  if (entry.rule === 'layer-cycle') {
    return [entry.rule, entry.symbol, entry.toLayer ?? ''].join('\0');
  }
  return [entry.rule, entry.file, entry.symbol, entry.toLayer ?? ''].join('\0');
}

/**
 * The key of the surplus of an entry: the part of its `count` that no finding uses. It is not the
 * key of the entry, because a finding that the entry accepts has the key of the entry, and
 * removing that finding drops the whole entry.
 */
export function surplusKeyOf(entry: Keyed): string {
  return `${keyOf(entry)}\0surplus`;
}

export function toKeyed(finding: Finding, rootDir: string): Keyed {
  return {
    rule: finding.rule,
    file: relative(rootDir, finding.file),
    symbol: finding.symbol,
    toLayer: finding.toLayer,
  };
}

export function compareEntries(a: Keyed, b: Keyed): number {
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
    (entry.toLayer === null || typeof entry.toLayer === 'string') &&
    (entry.count === undefined || isCount(entry.count))
  );
}

/**
 * One entry for each cycle. The counts of `layer-cycle` entries with the same key are added up:
 * an older baseline can name one cycle in more than one file. Other entries stay as they are.
 */
function mergeEntries(entries: BaselineEntry[]): BaselineEntry[] {
  const cycles = new Map<string, number>();
  const merged: BaselineEntry[] = [];
  for (const entry of entries) {
    const at = entry.rule === 'layer-cycle' ? cycles.get(keyOf(entry)) : undefined;
    if (at === undefined) {
      if (entry.rule === 'layer-cycle') {
        cycles.set(keyOf(entry), merged.length);
      }
      merged.push(entry);
    } else {
      const known = merged[at];
      merged[at] = { ...known, count: (known.count ?? 1) + (entry.count ?? 1) };
    }
  }
  return merged;
}

/**
 * `label` names the file in every message: a path, or `path at ref` for a file in git. `advice` is
 * the last sentence of an error that a new file would fix.
 */
export function parseBaseline(value: unknown, label: string, advice = FILE_ADVICE): Baseline {
  const baseline = value as Partial<Baseline> | null;
  checkVersion(typeof baseline === 'object' ? baseline?.version : undefined, label, advice);
  if (!Array.isArray(baseline?.entries)) {
    throw new LayerscopeError(`${label} is not a layerscope baseline. ${advice}`);
  }
  const invalid = baseline.entries.findIndex(entry => !isEntry(entry));
  if (invalid !== -1) {
    const why = hasBadCount(baseline.entries[invalid])
      ? '. A "count" must be a whole number above 0.'
      : '';
    throw new LayerscopeError(`${label}: entry ${invalid} is not a valid baseline entry${why}`);
  }
  return { version: BASELINE_VERSION, entries: mergeEntries(baseline.entries) };
}

/**
 * The one reader of baseline text, for a file and for a file in git. `ref` is the git ref of the
 * text: it changes the advice, because the fix is in that ref and not in the working tree.
 */
export function parseBaselineText(text: string, file: string, ref?: string): Baseline {
  const label = ref === undefined ? file : `${file} at ${ref}`;
  const fixIt =
    ref === undefined
      ? 'Fix the file, or create it again with --update-baseline.'
      : `Fix the file on ${ref}, or use another ref with --base.`;
  let value: unknown;
  try {
    value = parseJson(text);
  } catch (error) {
    throw new LayerscopeError(`${label} is not valid JSON (${(error as Error).message}). ${fixIt}`);
  }
  return parseBaseline(value, label, ref === undefined ? FILE_ADVICE : fixIt);
}

/** The baseline in `file`, or `null` when the file does not exist. */
export function readBaseline(file: string): Baseline | null {
  const text = readBaselineText(file);
  return text === null ? null : parseBaselineText(text, file);
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

/**
 * The result with the baseline applied, or unchanged when the file does not exist. With `inScope`
 * only the entries of those files count: a run that checked a few files cannot tell whether an
 * entry of another file is fixed.
 */
export function applyBaselineFile(
  result: AnalyzeResult,
  file: string,
  inScope?: (relativeFile: string) => boolean,
): AnalyzeResult {
  const baseline = readBaseline(file);
  if (baseline === null) {
    return result;
  }
  if (inScope === undefined) {
    return { ...result, ...applyBaseline(result.findings, baseline, file, result.rootDir) };
  }
  // A cycle entry has no file to scope by, and its finding can be hidden by the scope, so it is
  // kept for matching, and it is never listed as fixed.
  const scoped = {
    ...baseline,
    entries: baseline.entries.filter(entry => entry.rule === 'layer-cycle' || inScope(entry.file)),
  };
  const applied = applyBaseline(result.findings, scoped, file, result.rootDir);
  return {
    ...result,
    findings: applied.findings,
    baseline: {
      ...applied.baseline,
      removable: applied.baseline.removable.filter(entry => entry.rule !== 'layer-cycle'),
    },
  };
}
