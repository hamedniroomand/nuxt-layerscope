import type { BaselineEntry } from '#src/types.ts';

/** `layer-boundary useCart → web (×2)` */
export function describeEntry(entry: BaselineEntry): string {
  // The symbol of a cycle is the whole chain, so it already ends in the target layer.
  const target =
    entry.toLayer === null || entry.rule === 'layer-cycle' ? '' : ` → ${entry.toLayer}`;
  const count = (entry.count ?? 1) > 1 ? ` (×${entry.count})` : '';
  return `${entry.rule} ${entry.symbol}${target}${count}`;
}

export const UPDATE_HINT = 'Run "layerscope check --update-baseline" to remove';
