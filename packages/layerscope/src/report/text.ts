import { relative } from 'pathe';

import type { AnalyzeResult, BaselineResult, Finding } from '#src/types.ts';
import { plural } from '#src/utils/strings.ts';
import { plain } from '#src/utils/style.ts';
import type { Paint } from '#src/utils/style.ts';

import { describeEntry, UPDATE_HINT } from './baseline.ts';
import { findingDetails } from './details.ts';
import { summarize } from './summary.ts';

const DETAIL_INDENT = ' '.repeat(17);

function formatFinding(finding: Finding, cwd: string, paint: Paint): string {
  const position = paint('dim', `${finding.line}:${finding.column}`.padEnd(8));
  const color = finding.severity === 'error' ? 'red' : 'yellow';
  const severity = paint(color, finding.severity) + ' '.repeat(7 - finding.severity.length);
  const head = `  ${position}${severity}${finding.message}  ${paint('dim', finding.rule)}`;
  const details = findingDetails(finding, cwd).map(
    detail => `${DETAIL_INDENT}${paint('dim', detail)}`,
  );
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

function formatFooter(result: AnalyzeResult, paint: Paint): string {
  const suppressed = result.baseline?.suppressed.length ?? 0;
  const baselined = suppressed > 0 ? `, ${suppressed} more in the baseline` : '';
  if (result.findings.length === 0) {
    const clean = `✔ No problems in ${plural(result.files.length, 'file')} across ${plural(result.layers.length, 'layer')}`;
    return `${paint(['green', 'bold'], clean)}${baselined}`;
  }
  const { errors, warnings } = summarize(result.findings);
  const counts = `✖ ${plural(result.findings.length, 'problem')} (${plural(errors, 'error')}, ${plural(warnings, 'warning')})`;
  return `${paint(['bold', errors > 0 ? 'red' : 'yellow'], counts)}${baselined}`;
}

function hasError(findings: Finding[]): boolean {
  return findings.some(finding => finding.severity === 'error');
}

/** Files with errors come last, next to the summary, where they are least likely to scroll away. */
export function formatText(result: AnalyzeResult, cwd: string, paint: Paint = plain): string {
  const byFile = Map.groupBy(result.findings, finding => relative(cwd, finding.file));
  const files = [...byFile].toSorted(([, a], [, b]) => Number(hasError(a)) - Number(hasError(b)));
  const sections = files.map(([file, findings]) =>
    [paint('underline', file), ...findings.map(finding => formatFinding(finding, cwd, paint))].join(
      '\n',
    ),
  );
  const removable = result.baseline === undefined ? null : formatRemovable(result.baseline, cwd);
  const blocks = removable === null ? sections : [...sections, removable];
  return `${[...blocks, formatFooter(result, paint)].join('\n\n')}\n`;
}
