import { createBaseline, keyOf } from '#src/baseline/index.ts';
import type { Baseline } from '#src/baseline/index.ts';
import type { BaselineEntry, BaselineResult, Finding } from '#src/types.ts';

/** Everything that the baseline file accepts: the findings that it matched, and the entries left. */
export function acceptedBy(baseline: BaselineResult, rootDir: string): Baseline {
  const entries = new Map<string, BaselineEntry>();
  const all = [...createBaseline(baseline.suppressed, rootDir).entries, ...baseline.removable];
  for (const entry of all) {
    const known = entries.get(keyOf(entry));
    entries.set(
      keyOf(entry),
      known === undefined ? entry : { ...known, count: (known.count ?? 1) + (entry.count ?? 1) },
    );
  }
  return { version: 1, entries: [...entries.values()] };
}

/** The finding without a suggestion: an accepted finding has none. */
export function bare(finding: Finding): Finding {
  return Object.fromEntries(
    Object.entries(finding).filter(([key]) => key !== 'suggestion'),
  ) as unknown as Finding;
}
