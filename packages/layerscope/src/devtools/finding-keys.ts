import { keyOf, toKeyed } from '#src/baseline/index.ts';
import type { Finding } from '#src/types.ts';

/** How often each finding key occurs; findings are a multiset by key. */
export type KeyCounts = Map<string, number>;

export interface KeyDelta {
  key: string;
  /** How much the count of this key went up or down. */
  count: number;
}

export interface FindingDelta {
  added: KeyDelta[];
  removed: KeyDelta[];
}

/** The baseline key of a finding: rule, relative file, symbol and target layer, never the line. */
export function findingKey(finding: Finding, rootDir: string): string {
  return keyOf(toKeyed(finding, rootDir));
}

export function countKeys(findings: Finding[], rootDir: string): KeyCounts {
  const counts: KeyCounts = new Map();
  for (const finding of findings) {
    const key = findingKey(finding, rootDir);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function surplus(counts: KeyCounts, other: KeyCounts): KeyDelta[] {
  return [...counts].flatMap(([key, count]) => {
    const extra = count - (other.get(key) ?? 0);
    return extra > 0 ? [{ key, count: extra }] : [];
  });
}

/** Keys whose count went up (`added`) or down (`removed`) between two runs. */
export function diffKeys(before: KeyCounts, after: KeyCounts): FindingDelta {
  return { added: surplus(after, before), removed: surplus(before, after) };
}

/**
 * Marks findings that are new since the marker. Per key, the occurrences beyond the count the key
 * had at the marker are new, counted in report order.
 */
export function markNew(keys: string[], marker: KeyCounts): boolean[] {
  const seen = new Map<string, number>();
  return keys.map(key => {
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    return index >= (marker.get(key) ?? 0);
  });
}
