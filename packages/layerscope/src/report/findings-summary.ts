import { relative } from 'pathe';

import type { Finding } from '#src/types.ts';
import { plural } from '#src/utils/strings.ts';

import { summarize } from './summary.ts';

/** The most lines in the list of the summary. */
export const SUMMARY_LINE_LIMIT = 200;

function line(finding: Finding, cwd: string): string {
  const place = `${relative(cwd, finding.file)}:${finding.line}:${finding.column}`;
  // The details after the first line stay in the annotation of the `github` format.
  const message = finding.message.split('\n')[0] ?? '';
  // The same word as the `github` annotations and the count use.
  const severity = finding.severity === 'error' ? 'error' : 'warning';
  return `${severity} ${finding.rule} ${place} ${message}`;
}

/** A fence of backticks that no line of the text can close. */
function fenceFor(lines: string[]): string {
  const runs = lines.flatMap(text => text.match(/`+/gu) ?? []);
  return '`'.repeat(Math.max(3, ...runs.map(run => run.length + 1)));
}

function countSentence(findings: Finding[]): string {
  const { errors, warnings } = summarize(findings);
  const kinds = [
    ...(errors > 0 ? [plural(errors, 'error')] : []),
    ...(warnings > 0 ? [plural(warnings, 'warning')] : []),
  ];
  return `The check found ${kinds.join(' and ')}.`;
}

/**
 * Markdown for a job summary: the count of the findings and a list of them, up to
 * `SUMMARY_LINE_LIMIT` lines. The list is in a code block, so no text of a finding is read as
 * Markdown or HTML. It is empty when there is no finding.
 */
export function formatFindingsSummary(findings: Finding[], cwd: string): string {
  if (findings.length === 0) {
    return '';
  }
  const lines = findings.slice(0, SUMMARY_LINE_LIMIT).map(finding => line(finding, cwd));
  const fence = fenceFor(lines);
  const parts = [countSentence(findings), `${fence}\n${lines.join('\n')}\n${fence}`];
  if (findings.length > SUMMARY_LINE_LIMIT) {
    parts.push(
      `The list stops at ${SUMMARY_LINE_LIMIT} lines. Run layerscope check to see all findings.`,
    );
  }
  return `${parts.join('\n\n')}\n`;
}
