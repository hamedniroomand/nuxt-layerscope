import type { AnalyzeResult, BaselineEntry } from '#src/types.ts';

/** `layer-boundary useCart → web (×2)` */
export function describeEntry(entry: BaselineEntry): string {
  // The symbol of a cycle is the whole chain, so it already ends in the target layer.
  const target =
    entry.toLayer === null || entry.rule === 'layer-cycle' ? '' : ` → ${entry.toLayer}`;
  const count = (entry.count ?? 1) > 1 ? ` (×${entry.count})` : '';
  return `${entry.rule} ${entry.symbol}${target}${count}`;
}

export const UPDATE_HINT = 'Run "layerscope check --update-baseline" to remove';

/**
 * Whether `--strict-baseline` fails a fixed entry. With the `.d.ts` source, `shadowed-component`
 * cannot run, so its entries are not known to be fixed.
 */
export function failsStrict(entry: BaselineEntry, result: AnalyzeResult): boolean {
  return !(entry.rule === 'shadowed-component' && result.source === 'types');
}

/** The fixed entries that `--strict-baseline` fails. */
export function strictEntries(result: AnalyzeResult): BaselineEntry[] {
  return (result.baseline?.removable ?? []).filter(entry => failsStrict(entry, result));
}
