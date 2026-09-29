import { relative } from 'pathe';

import type { AnalyzeResult, BaselineResult, Finding } from '#src/types.ts';
import { plural } from '#src/utils/strings.ts';

import { describeEntry, UPDATE_HINT } from './baseline.ts';
import { findingDetails } from './details.ts';
import { summarize } from './summary.ts';

const DETAIL_INDENT = ' '.repeat(17);

function formatFinding(finding: Finding, cwd: string): string {
  const position = `${finding.line}:${finding.column}`.padEnd(8);
  const head = `  ${position}${finding.severity.padEnd(7)}${finding.message}  ${finding.rule}`;
  const details = findingDetails(finding, cwd).map(detail => `${DETAIL_INDENT}${detail}`);
  return [head, ...details].join('\n');
}

function formatRemovable(baseline: BaselineResult, cwd: string): string | null {
  if (baseline.removable.length === 0) {
    return null;
  }
  const entries = baseline.removable.map(entry => `  ${entry.file}  ${describeEntry(entry)}`);
  const count = baseline.removable.length;
  const head = `${relative(cwd, baseline.file)}: ${plural(count, 'fixed entry', 'fixed entries')}. ${UPDATE_HINT} ${count === 1 ? 'it' : 'them'}.`;
  return [head, ...entries].join('\n');
}

function formatFooter(result: AnalyzeResult): string {
  const suppressed = result.baseline?.suppressed.length ?? 0;
  const baselined = suppressed > 0 ? `, ${suppressed} more in the baseline` : '';
  if (result.findings.length === 0) {
    return `✔ No problems in ${plural(result.files.length, 'file')} across ${plural(result.layers.length, 'layer')}${baselined}`;
  }
  const { errors, warnings } = summarize(result.findings);
  return `✖ ${plural(result.findings.length, 'problem')} (${plural(errors, 'error')}, ${plural(warnings, 'warning')})${baselined}`;
}

export function formatText(result: AnalyzeResult, cwd: string): string {
  const byFile = Map.groupBy(result.findings, finding => relative(cwd, finding.file));
  const sections = [...byFile].map(([file, findings]) =>
    [file, ...findings.map(finding => formatFinding(finding, cwd))].join('\n'),
  );
  const removable = result.baseline === undefined ? null : formatRemovable(result.baseline, cwd);
  const blocks = removable === null ? sections : [...sections, removable];
  return `${[...blocks, formatFooter(result)].join('\n\n')}\n`;
}
