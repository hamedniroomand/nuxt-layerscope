import { relative } from 'pathe';

import type { Finding } from '#src/types.ts';

/** Where the symbol resolves to and what the layer may use, so the fix is obvious. */
export function findingDetails(finding: Finding, cwd: string): string[] {
  const details: string[] = [];
  if (finding.target !== null) {
    details.push(`${finding.symbol} → ${relative(cwd, finding.target)}`);
  }
  if (finding.allowed !== undefined) {
    const scoped = (finding.scoped ?? []).map(
      entry => `${entry.layer} (only ${entry.only.join(', ')})`,
    );
    const all = [...finding.allowed, ...scoped];
    details.push(
      `allowed for "${finding.fromLayer}": ${all.length > 0 ? all.join(', ') : 'no other layers'}`,
    );
  }
  if (finding.exposed !== undefined) {
    const exposed = finding.exposed.length > 0 ? finding.exposed.join(', ') : 'nothing';
    details.push(`exposed by "${finding.toLayer}": ${exposed}`);
  }
  if (finding.suggestion !== undefined) {
    details.push(`suggestion: ${finding.suggestion.message}`);
  }
  return details;
}
