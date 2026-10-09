import type { AnalyzeResult, Finding } from '#src/types.ts';

import { fingerprints } from './fingerprint.ts';
import { repoPath } from './paths.ts';

// GitLab's `critical` and `blocker` mean crashes and security issues, so errors are `major`.
const SEVERITY: Record<Finding['severity'], string> = { error: 'major', warn: 'minor' };

/**
 * A GitLab Code Quality report. Paths are relative to `repoRoot` (default: the project root).
 * The format has no suppression state, so findings the baseline accepts are left out.
 */
export function formatGitlab(
  result: AnalyzeResult,
  _cwd: string,
  _paint: unknown,
  repoRoot: string = result.rootDir,
): string {
  const ids = fingerprints(result);
  const issues = result.findings.map(finding => ({
    description: finding.message,
    check_name: finding.rule,
    fingerprint: ids.get(finding) ?? '',
    severity: SEVERITY[finding.severity],
    location: { path: repoPath(finding.file, repoRoot), lines: { begin: finding.line } },
  }));
  return `${JSON.stringify(issues, null, 2)}\n`;
}
