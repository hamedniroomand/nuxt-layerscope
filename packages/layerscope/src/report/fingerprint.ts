import { createHash } from 'node:crypto';

import { keyOf, toKeyed } from '#src/baseline/index.ts';
import { compareByPosition } from '#src/rules/compare.ts';
import type { AnalyzeResult, Finding } from '#src/types.ts';

/**
 * A stable id for each finding, live or accepted by the baseline: the sha256 of the baseline key
 * (rule, file, symbol, target layer), which has no line number, so unrelated edits keep it.
 * Findings with the same key in one file get an occurrence number, counted in report order. A new
 * duplicate above an old one moves the numbers; the baseline `count` has the same limit.
 */
export function fingerprints(result: AnalyzeResult): Map<Finding, string> {
  const all = [...result.findings, ...(result.baseline?.suppressed ?? [])].toSorted(
    compareByPosition,
  );
  const seen = new Map<string, number>();
  return new Map(
    all.map(finding => {
      const key = keyOf(toKeyed(finding, result.rootDir));
      const occurrence = seen.get(key) ?? 0;
      seen.set(key, occurrence + 1);
      return [finding, createHash('sha256').update(`${key}\0${occurrence}`).digest('hex')];
    }),
  );
}
