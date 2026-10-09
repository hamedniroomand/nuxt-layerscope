import { relative } from 'pathe';

import type { Cluster, Proposal } from '#src/init/index.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { plural } from '#src/utils/strings.ts';
import type { Paint } from '#src/utils/style.ts';
import { plain } from '#src/utils/style.ts';

export interface InitReportOptions {
  source: string;
  written: boolean;
  configFile: string;
  baselineFile: string | null;
  paint?: Paint;
}

function clusters(title: string, items: Cluster[], paint: Paint): string[] {
  if (items.length === 0) {
    return [];
  }
  return [
    `  ${paint('dim', title)}`,
    ...items.map(item => `    ${String(item.count).padStart(4)}  ${item.key}`),
  ];
}

function readinessLines({ readiness }: Proposal, paint: Paint): string[] {
  if (readiness.unresolved === 0) {
    return [`  All ${plural(readiness.references, 'reference')} resolved.`];
  }
  const share = Math.round((readiness.unresolved / readiness.references) * 100);
  return [
    `  ${readiness.unresolved} of ${plural(readiness.references, 'reference')} could not be resolved (${share}%).`,
    ...clusters('By layer', readiness.byLayer, paint),
    ...clusters('By directory', readiness.byDirectory, paint),
  ];
}

function presetLines({ preset, edges }: Proposal): string[] {
  if (preset === null || edges.length === 0) {
    return [];
  }
  const base = preset.base.length === 0 ? '' : ` (base: ${preset.base.join(', ')})`;
  return [
    '',
    `A preset fits these dependencies: ${preset.name}${base}.`,
    `Use preset: '${preset.name}' instead of the allowed edges above, if you want the shape and not the list.`,
  ];
}

function nextSteps({ remaining }: Proposal, options: InitReportOptions): string[] {
  if (!options.written) {
    return ['Nothing written (--dry-run). The config would be:', '', options.source];
  }
  const lines = [`✔ Wrote ${options.configFile}`];
  if (options.baselineFile !== null) {
    lines.push(`✔ Wrote ${plural(remaining.length, 'finding')} to ${options.baselineFile}`);
  } else if (remaining.length > 0) {
    lines.push(
      `  ${plural(remaining.length, 'finding')} would still be reported. Run with --baseline to accept them.`,
    );
  }
  lines.push(
    '',
    'Delete the allowed edges you consider mistakes, then run "layerscope check" to see what breaks.',
  );
  return lines;
}

export function formatInit(
  result: AnalyzeResult,
  proposal: Proposal,
  options: InitReportOptions,
): string {
  const paint = options.paint ?? plain;
  const lines = [
    paint('bold', `Layers (${result.layers.length})`),
    ...result.layers.map(
      layer => `  ${layer.name}  ${relative(result.rootDir, layer.root) || '.'}`,
    ),
    '',
    paint('bold', `Allowed edges (${proposal.edges.length})`),
    ...(proposal.edges.length === 0
      ? ['  none: no layer depends on another']
      : proposal.edges.map(
          edge =>
            `  ${edge.from} → ${edge.to}  ${plural(edge.count, 'reference')}, e.g. ${edge.example}`,
        )),
    ...presetLines(proposal),
    '',
    paint('bold', 'Readiness'),
    ...readinessLines(proposal, paint),
    '',
    ...nextSteps(proposal, options),
  ];
  return `${lines.join('\n')}\n`;
}
