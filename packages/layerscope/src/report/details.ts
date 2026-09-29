import { relative } from 'pathe';

import type { Finding } from '#src/types.ts';

/** Where the symbol resolves to and what the layer may use, so the fix is obvious. */
export function findingDetails(finding: Finding, cwd: string): string[] {
  const details: string[] = [];
  if (finding.target !== null) {
    details.push(`${finding.symbol} → ${relative(cwd, finding.target)}`);
  }
  if (finding.allowed !== undefined) {
    const allowed = finding.allowed.length > 0 ? finding.allowed.join(', ') : 'no other layers';
    details.push(`allowed for "${finding.fromLayer}": ${allowed}`);
  }
  return details;
}
