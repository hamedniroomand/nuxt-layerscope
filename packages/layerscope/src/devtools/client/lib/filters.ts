import type { TabFinding } from '#src/devtools/protocol.ts';

import type { FindingsQuery, GroupBy } from './router.ts';

export interface FindingGroup {
  key: string;
  label: string;
  /** Worst severity in the group, for the group glyph. */
  severity: TabFinding['severity'];
  findings: TabFinding[];
}

export interface ChipCount {
  value: string;
  count: number;
}

export function pairOf(finding: TabFinding): string | null {
  return finding.toLayer === null ? null : `${finding.fromLayer}:${finding.toLayer}`;
}

function matchesText(finding: TabFinding, text: string): boolean {
  if (text === '') {
    return true;
  }
  const needle = text.toLowerCase();
  return [finding.file, finding.symbol, finding.message].some(value =>
    value.toLowerCase().includes(needle),
  );
}

function matchesAny(selected: string[], value: string): boolean {
  return selected.length === 0 || selected.includes(value);
}

/** Findings that pass every active filter, in report order. */
export function filterFindings(findings: TabFinding[], query: FindingsQuery): TabFinding[] {
  return findings.filter(
    finding =>
      matchesAny(query.sev, finding.severity) &&
      matchesAny(query.rule, finding.rule) &&
      (query.pair === null || pairOf(finding) === query.pair) &&
      (query.file === null || finding.file === query.file) &&
      (!query.onlyNew || finding.isNew) &&
      matchesText(finding, query.q.trim()),
  );
}

function groupKey(finding: TabFinding, group: GroupBy): string {
  if (group === 'rule') {
    return finding.rule;
  }
  if (group === 'file') {
    return finding.file;
  }
  if (group === 'pair') {
    return pairOf(finding) ?? '';
  }
  return 'all';
}

function groupLabel(key: string, group: GroupBy): string {
  if (group === 'pair') {
    return key === '' ? 'no target layer' : key.replace(':', ' → ');
  }
  return group === 'none' ? 'All findings' : key;
}

function severityRank(group: FindingGroup): number {
  return group.severity === 'error' ? 0 : 1;
}

/** Groups with errors first, then in order of first appearance in the report. */
export function groupFindings(findings: TabFinding[], group: GroupBy): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();
  for (const finding of findings) {
    const key = groupKey(finding, group);
    const entry = groups.get(key) ?? {
      key,
      label: groupLabel(key, group),
      severity: 'warn',
      findings: [],
    };
    entry.findings.push(finding);
    if (finding.severity === 'error') {
      entry.severity = 'error';
    }
    groups.set(key, entry);
  }
  return [...groups.values()].toSorted((a, b) => severityRank(a) - severityRank(b));
}

/** Counts per value, for the filter chips; sorted by count, then by value. */
export function countBy(
  findings: TabFinding[],
  pick: (finding: TabFinding) => string,
): ChipCount[] {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    const value = pick(finding);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .toSorted((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

const SEVERITY_ORDER = ['error', 'warn'];

/** The severity chips, errors first whatever the counts, as everywhere else in the tab. */
export function severityChips(findings: TabFinding[]): ChipCount[] {
  return countBy(findings, finding => finding.severity).toSorted(
    (a, b) => SEVERITY_ORDER.indexOf(a.value) - SEVERITY_ORDER.indexOf(b.value),
  );
}

/** Adds or removes one value of a multi-select filter. */
export function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value];
}

/**
 * A stable id per row: the finding key plus its occurrence among findings with that key. When a
 * finding is fixed, the other rows keep their ids, so nothing moves under the pointer.
 */
export function rowIds(findings: TabFinding[]): Map<TabFinding, string> {
  const seen = new Map<string, number>();
  const ids = new Map<TabFinding, string>();
  for (const finding of findings) {
    const index = seen.get(finding.key) ?? 0;
    seen.set(finding.key, index + 1);
    ids.set(finding, `${finding.key}#${index}`);
  }
  return ids;
}
