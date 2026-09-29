import type { BaselineEntry } from '#src/types.ts';

/** `layer-boundary useCart → web (×2)` */
export function describeEntry(entry: BaselineEntry): string {
  const target = entry.toLayer === null ? '' : ` → ${entry.toLayer}`;
  const count = (entry.count ?? 1) > 1 ? ` (×${entry.count})` : '';
  return `${entry.rule} ${entry.symbol}${target}${count}`;
}

export const UPDATE_HINT = 'Run "layerscope check --update-baseline" to remove';
