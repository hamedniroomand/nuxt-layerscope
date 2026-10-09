import { LayerConfigError } from '#src/layer-config-error.ts';
import type { Layer, LayerscopeConfig, PresetName, PresetOptions } from '#src/types.ts';

export const PRESETS: readonly PresetName[] = ['layered', 'stacked', 'features'];

/** What `features` takes as its base layers when `base` is not set: the first name that exists. */
export const FEATURES_BASE_CANDIDATES: readonly (readonly string[])[] = [
  ['core', 'base', 'shared', 'common'],
  ['ui', 'design-system'],
];

export function isPreset(name: string): name is PresetName {
  return PRESETS.some(preset => preset === name);
}

export function presetName(preset: PresetName | PresetOptions): PresetName {
  return typeof preset === 'string' ? preset : preset.name;
}

/** A preset as it was resolved for a project: the base layers it picked and what it allows. */
export interface ResolvedPreset {
  name: PresetName;
  /** Lowest first. Empty for `stacked`, and for `layered` and `features` without a base layer. */
  base: string[];
  /** The layers each layer may use, in the order of the layer names given. */
  allow: string[][];
}

function firstOf(candidates: readonly string[], names: string[]): string[] {
  const found = candidates.find(candidate => names.includes(candidate));
  return found === undefined ? [] : [found];
}

function defaultBase(name: PresetName, names: string[]): string[] {
  if (name === 'layered') {
    return names.includes('shared') ? ['shared'] : [];
  }
  return FEATURES_BASE_CANDIDATES.flatMap(candidates => firstOf(candidates, names));
}

/** The base layer of `layered` and the base layers of `features`, from `base` or the defaults. */
function baseOf(preset: PresetName | PresetOptions, names: string[]): string[] {
  const name = presetName(preset);
  const given = typeof preset === 'string' ? undefined : preset.base;
  if (given === undefined) {
    return defaultBase(name, names);
  }
  for (const layer of given) {
    if (layer === 'root') {
      throw new LayerConfigError(
        `preset "${name}": "root" cannot be a base layer. It composes the other layers, so a preset leaves it unrestricted`,
      );
    }
    if (!names.includes(layer)) {
      throw new LayerConfigError(
        `preset "${name}": base layer "${layer}" is not a layer. Known layers: ${names.join(', ')}`,
      );
    }
  }
  return given;
}

/**
 * Every layer may use the base layers, and a base layer may use the ones below it. `layered` is
 * the case of one base layer.
 */
function onBase(names: string[], base: string[]): string[][] {
  return names.map(name => {
    const index = base.indexOf(name);
    return index === -1 ? base : base.slice(0, index);
  });
}

function onLayersBelow(names: string[]): string[][] {
  return names.map((_, index) => names.slice(index + 1));
}

/** `names` are the layers without `root`, in priority order. */
export function resolvePreset(preset: PresetName | PresetOptions, names: string[]): ResolvedPreset {
  const name = presetName(preset);
  if (name === 'stacked') {
    return { name, base: [], allow: onLayersBelow(names) };
  }
  const base = baseOf(preset, names);
  return { name, base, allow: onBase(names, base) };
}

/** `root` composes the other layers, so it stays unrestricted unless the config says otherwise. */
export function applyPreset(config: LayerscopeConfig, layers: Layer[]): LayerscopeConfig {
  if (config.preset === undefined) {
    return config;
  }
  const names = layers.map(layer => layer.name).filter(name => name !== 'root');
  const { allow } = resolvePreset(config.preset, names);
  const filled = Object.fromEntries(
    names.map((name, index) => [name, { allow: allow[index], ...config.layers?.[name] }]),
  );
  return { ...config, layers: { ...config.layers, ...filled } };
}

/** The preset of a config as it was resolved, or `null` without one. Shown in `layers` and `init`. */
export function describePreset(
  config: LayerscopeConfig,
  layers: Layer[],
): { name: PresetName; base: string[] } | null {
  if (config.preset === undefined) {
    return null;
  }
  const names = layers.map(layer => layer.name).filter(name => name !== 'root');
  const { name, base } = resolvePreset(config.preset, names);
  return { name, base };
}
