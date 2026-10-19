import { REGISTRY_ONLY_RULES } from '#src/config/rules.ts';
import type { AnalyzeResult, BaselineEntry } from '#src/types.ts';

/** `layer-boundary useCart → web (×2)` */
export function describeEntry(entry: BaselineEntry): string {
  // The symbol of a cycle is the whole chain, so it already ends in the target layer.
  const target =
    entry.toLayer === null || entry.rule === 'layer-cycle' ? '' : ` → ${entry.toLayer}`;
  const count = (entry.count ?? 1) > 1 ? ` (×${entry.count})` : '';
  return `${entry.rule} ${entry.symbol}${target}${count}`;
}

/** How the run treats the baseline: `--strict-baseline`, and the command that removes fixed entries. */
export interface BaselineRun {
  strict: boolean;
  command: string;
}

export const DEFAULT_RUN: BaselineRun = {
  strict: false,
  command: 'layerscope check --update-baseline',
};

export function updateHint(command: string): string {
  return `Run "${command}" to remove`;
}

/**
 * Whether `--strict-baseline` fails a fixed entry. With the `.d.ts` source, the registry-only
 * rules cannot run, so their entries are not known to be fixed.
 */
export function failsStrict(entry: BaselineEntry, result: AnalyzeResult): boolean {
  return !(REGISTRY_ONLY_RULES.includes(entry.rule) && result.source === 'types');
}

/** The fixed entries that `--strict-baseline` fails. */
export function strictEntries(result: AnalyzeResult): BaselineEntry[] {
  return (result.baseline?.removable ?? []).filter(entry => failsStrict(entry, result));
}
