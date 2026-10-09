import { relative } from 'pathe';

import type { AnalyzeResult, BaselineResult, Finding, Suggestion } from '#src/types.ts';

import { summarize } from './summary.ts';

/** Bumped on breaking changes to the JSON report shape. */
export const JSON_REPORT_VERSION = 1;

function relativeSuggestion(suggestion: Suggestion, cwd: string): Suggestion {
  return suggestion.file === undefined
    ? suggestion
    : { ...suggestion, file: relative(cwd, suggestion.file) };
}

export function relativeFinding(finding: Finding, cwd: string): Finding {
  return {
    ...finding,
    file: relative(cwd, finding.file),
    target: finding.target === null ? null : relative(cwd, finding.target),
    ...(finding.suggestion && { suggestion: relativeSuggestion(finding.suggestion, cwd) }),
  };
}

function formatBaseline(baseline: BaselineResult, cwd: string): object {
  return {
    file: relative(cwd, baseline.file),
    suppressed: baseline.suppressed.map(finding => relativeFinding(finding, cwd)),
    removable: baseline.removable,
  };
}

export function formatJson(result: AnalyzeResult, cwd: string): string {
  const report = {
    version: JSON_REPORT_VERSION,
    source: result.source,
    notes: result.notes,
    layers: result.layers.map(layer => ({
      name: layer.name,
      root: relative(cwd, layer.root) || '.',
    })),
    summary: { files: result.files.length, ...summarize(result.findings) },
    findings: result.findings.map(finding => relativeFinding(finding, cwd)),
    ...(result.baseline === undefined ? {} : { baseline: formatBaseline(result.baseline, cwd) }),
  };
  return `${JSON.stringify(report, null, 2)}\n`;
}
