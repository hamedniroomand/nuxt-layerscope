import { createHash } from 'node:crypto';

import { keyOf, toKeyed } from '#src/baseline/index.ts';
import { compareByPosition } from '#src/rules/compare.ts';
import type { AnalyzeResult, Finding } from '#src/types.ts';
import { compareStrings } from '#src/utils/strings.ts';

/**
 * A stable id for each finding, live or accepted by the baseline: the sha256 of the baseline key
 * (rule, file, symbol, target layer; a `layer-cycle` key has no file), which has no line number,
 * so unrelated edits keep it.
 * Findings with the same key get an occurrence number, counted in report order. Two findings at
 * the same place are counted live first, then in the order of their target file, then of their
 * message. A new duplicate above an old one moves the numbers; the baseline `count` has the same
 * limit.
 */
export function fingerprints(result: AnalyzeResult): Map<Finding, string> {
  // Live first, then the target and the message break a tie of two findings of one use, so each
  // keeps its id when the input order changes. Findings that still tie show the same text. The
  // live rank comes after the position, so a key with findings at other lines keeps its numbers.
  const live = new Set(result.findings);
  const rank = (finding: Finding): number => (live.has(finding) ? 0 : 1);
  const all = [...result.findings, ...(result.baseline?.suppressed ?? [])].toSorted(
    (a, b) =>
      compareByPosition(a, b) ||
      rank(a) - rank(b) ||
      compareStrings(a.target ?? '', b.target ?? '') ||
      compareStrings(a.message, b.message),
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
