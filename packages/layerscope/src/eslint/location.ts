import type { Finding } from '#src/types.ts';
import type { Position } from '#src/utils/position.ts';
import { lineColumn, offsetAt } from '#src/utils/position.ts';

export interface ReportLocation extends Position {
  /** Set when the finding lies outside the text the linter passed, such as a `.vue` template. */
  outside: boolean;
}

/**
 * Maps a finding from the full file into the text the linter passed. ESLint passes the full
 * file; oxlint passes only a `.vue` file's `<script>`, where template findings have no position.
 */
export function reportLocation(finding: Finding, source: string, text: string): ReportLocation {
  if (source === text) {
    return { line: finding.line, column: finding.column, outside: false };
  }
  const base = source.indexOf(text);
  const offset = offsetAt(source, finding) - base;
  if (base === -1 || offset < 0 || offset > text.length) {
    return { line: 1, column: 1, outside: true };
  }
  return { ...lineColumn(text, offset), outside: false };
}
