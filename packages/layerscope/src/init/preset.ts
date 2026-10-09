import { resolvePreset } from '#src/config/presets.ts';
import type { PresetName } from '#src/types.ts';

import type { AllowedEdge, PresetFit } from './types.ts';

/** On a tie the one that says more about the shape comes first: `stacked` only follows the order. */
const ORDER: PresetName[] = ['layered', 'features', 'stacked'];

/**
 * The strictest preset that allows every dependency that exists today, with the base layers that
 * it picked. A project where no layer depends on another gets none: every preset fits it. Edges
 * from `root` are left out first, because a preset does not restrict `root`.
 */
export function fittingPreset(edges: AllowedEdge[], layerNames: string[]): PresetFit | null {
  // A preset leaves `root` unrestricted, so what `root` uses never counts against it.
  const counted = edges.filter(edge => edge.from !== 'root');
  if (counted.length === 0) {
    return null;
  }
  const names = layerNames.filter(name => name !== 'root');
  const fits = ORDER.flatMap(preset => {
    const { name, base, allow } = resolvePreset(preset, names);
    const allowed = new Map(names.map((layer, index) => [layer, allow[index]]));
    const holds = counted.every(edge => allowed.get(edge.from)?.includes(edge.to) === true);
    return holds ? [{ name, base, pairs: allow.reduce((sum, list) => sum + list.length, 0) }] : [];
  });
  const best = fits.toSorted((a, b) => a.pairs - b.pairs).at(0);
  return best === undefined ? null : { name: best.name, base: best.base };
}
