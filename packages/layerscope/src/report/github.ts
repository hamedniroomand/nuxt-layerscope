import { relative } from 'pathe';

import type { AnalyzeResult, BaselineEntry, Finding } from '#src/types.ts';

import { describeEntry, UPDATE_HINT } from './baseline.ts';
import { findingDetails } from './details.ts';

// Escaping rules of GitHub Actions workflow commands.
function escapeData(value: string): string {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function escapeProperty(value: string): string {
  return escapeData(value).replaceAll(':', '%3A').replaceAll(',', '%2C');
}

function formatAnnotation(finding: Finding, cwd: string): string {
  const command = finding.severity === 'error' ? 'error' : 'warning';
  const properties = [
    `file=${escapeProperty(relative(cwd, finding.file))}`,
    `line=${finding.line}`,
    `col=${finding.column}`,
    `title=${escapeProperty(`layerscope ${finding.rule}`)}`,
  ].join(',');
  const message = [finding.message, ...findingDetails(finding, cwd)].join('\n');
  return `::${command} ${properties}::${escapeData(message)}\n`;
}

function formatRemovable(entry: BaselineEntry, file: string): string {
  const message = `Fixed baseline entry in ${entry.file}: ${describeEntry(entry)}. ${UPDATE_HINT} it.`;
  return `::notice file=${escapeProperty(file)},title=layerscope baseline::${escapeData(message)}\n`;
}

/** Workflow commands that GitHub shows inline on the pull request diff. */
export function formatGithub(result: AnalyzeResult, cwd: string): string {
  const annotations = result.findings.map(finding => formatAnnotation(finding, cwd));
  const { baseline } = result;
  const removable =
    baseline === undefined
      ? []
      : baseline.removable.map(entry => formatRemovable(entry, relative(cwd, baseline.file)));
  return [...annotations, ...removable].join('');
}
