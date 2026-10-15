import { baselineSize } from '#src/baseline/index.ts';
import type { Drift } from '#src/drift/index.ts';
import type { BaselineEntry } from '#src/types.ts';

import { describeEntry } from './baseline.ts';

export const DRIFT_FORMATS = ['text', 'markdown', 'json'] as const;

export type DriftFormat = (typeof DRIFT_FORMATS)[number];

export function isDriftFormat(value: string): value is DriftFormat {
  return DRIFT_FORMATS.some(format => format === value);
}

function headline({ added, fixed }: Drift): string {
  return `adds ${baselineSize(added)}, fixes ${baselineSize(fixed)}`;
}

function trend({ baselineSize: { base, current } }: Drift): string {
  const delta = current - base;
  const sign = Math.sign(delta) === 1 ? '+' : Math.sign(delta) === -1 ? '−' : '±';
  return `Baseline: ${base} → ${current} (${sign}${Math.abs(delta)})`;
}

function list(title: string, entries: BaselineEntry[], bullet: string): string[] {
  if (entries.length === 0) {
    return [];
  }
  return ['', title, ...entries.map(entry => `${bullet}${entry.file}  ${describeEntry(entry)}`)];
}

function formatJson(drift: Drift): string {
  const report = {
    ...drift,
    adds: baselineSize(drift.added),
    fixes: baselineSize(drift.fixed),
  };
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** The sentence for `--fail-on-growth` when the code has `count` errors more than the base. */
export function growthSentence(count: number, base: string, markdown: boolean): string {
  const errors = count === 1 ? '1 error' : `${count} errors`;
  const ref = markdown ? `\`${base}\`` : base;
  return `✖ The code has ${errors} that the baseline at ${ref} does not have (--fail-on-growth).`;
}

/** The end of a markdown report that fails `--fail-on-growth`. */
export function formatGrowthMarkdown(count: number, base: string): string {
  return `\n**${growthSentence(count, base, true)}**\n\nIf this growth is intended, for example after a stricter config or a newer layerscope, a maintainer can merge the pull request without this check.\n`;
}

export function formatDrift(drift: Drift, format: DriftFormat): string {
  if (format === 'json') {
    return formatJson(drift);
  }
  const markdown = format === 'markdown';
  const head = markdown
    ? `### layerscope\n\n**${headline(drift)}** against \`${drift.base}\`\n\n${trend(drift)}`
    : `${headline(drift)} against ${drift.base}\n${trend(drift)}`;
  const bullet = markdown ? '- ' : '  ';
  const lines = [
    head,
    ...list('Added:', drift.added, bullet),
    ...list('Fixed:', drift.fixed, bullet),
  ];
  return `${lines.join('\n')}\n`;
}
