import type { Finding } from '#src/types.ts';

/** The message of a finding, with its suggestion on a second line, for formats with no field of its own. */
export function messageWithSuggestion(finding: Finding): string {
  return finding.suggestion === undefined
    ? finding.message
    : `${finding.message}\nsuggestion: ${finding.suggestion.message}`;
}
