import type { Finding } from '#src/types.ts';

export interface Summary {
  errors: number;
  warnings: number;
}

export function summarize(findings: Finding[]): Summary {
  const errors = findings.filter(finding => finding.severity === 'error').length;
  return { errors, warnings: findings.length - errors };
}
