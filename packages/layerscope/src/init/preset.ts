import { resolvePreset } from '#src/config/presets.ts';
import type { PresetName, PresetOptions } from '#src/types.ts';

import type { AllowedEdge, PresetFit } from './types.ts';

/** On a tie the one that says more about the shape comes first: `stacked` only follows the order. */
const ORDER: PresetName[] = ['layered', 'features', 'stacked'];

/**
 * The shapes that `root` can take as the base of a preset. They are all `features`, because it
 * accepts more than one base layer. `features` with `['root']` gives the same result as `layered`
 * with `['root']`. `['root']` alone is the stricter one, so it comes first. Then come `root` with the default base layers of `features` and of `layered`. A
 * project with a `core` layer that the features do not use gets `['root']`; one that uses `core`
 * gets the wider base.
 */
function rootBases(names: string[]): PresetOptions[] {
  const lists = [[], resolvePreset('features', names).base, resolvePreset('layered', names).base];
  const unique = new Map(lists.map(list => [list.join('\0'), list]));
  return [...unique.values()].map(list => ({ name: 'features', base: ['root', ...list] }));
}

/**
 * The strictest preset that allows every dependency that exists today, with the base layers that
 * it picked. A project where no layer depends on another gets none: every preset fits it. Edges
 * from `root` are left out for a plain preset, because it does not restrict `root`. A preset with
 * `root` as its base restricts `root`: it may use no other layer, so the edges of `root` count for
 * it. Those presets are tried after the plain ones. A root variant allows more than the plain
 * preset with the same base, so when a plain preset fits, it is suggested, because it is stricter.
 */
export function fittingPreset(edges: AllowedEdge[], layerNames: string[]): PresetFit | null {
  // A preset leaves `root` unrestricted, so what `root` uses never counts against it.
  const counted = edges.filter(edge => edge.from !== 'root');
  if (counted.length === 0) {
    return null;
  }
  const names = layerNames.filter(name => name !== 'root');
  const candidates: (PresetName | PresetOptions)[] = [...ORDER, ...rootBases(names)];
  const fits = candidates.flatMap(preset => {
    const { name, base, allow } = resolvePreset(preset, names);
    const allowed = new Map(names.map((layer, index) => [layer, allow[index]]));
    // With `root` in the base, `root` is the lowest base layer: its own edges must fit too.
    const checked = base.includes('root') ? edges : counted;
    const holds = checked.every(edge => allowed.get(edge.from)?.includes(edge.to) === true);
    const pairs = allow.reduce((sum, list) => sum + list.length, 0);
    return holds ? [{ name, base, pairs, object: typeof preset !== 'string' }] : [];
  });
  const best = fits.toSorted((a, b) => a.pairs - b.pairs).at(0);
  if (best === undefined) {
    return null;
  }
  // The object form is only marked when it is needed, so a plain fit keeps its shape.
  return best.object
    ? { name: best.name, base: best.base, object: true }
    : { name: best.name, base: best.base };
}
