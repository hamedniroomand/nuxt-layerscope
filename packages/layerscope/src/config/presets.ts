import type { Layer, LayerscopeConfig, PresetName } from '#src/types.ts';

export const PRESETS: readonly PresetName[] = ['layered', 'stacked'];

export function isPreset(name: string): name is PresetName {
  return PRESETS.some(preset => preset === name);
}

const allowed: Record<PresetName, (names: string[]) => string[][]> = {
  layered: names =>
    names.map(name => (name !== 'shared' && names.includes('shared') ? ['shared'] : [])),
  stacked: names => names.map((_, index) => names.slice(index + 1)),
};

/** `root` composes the other layers, so it stays unrestricted unless the config says otherwise. */
export function applyPreset(config: LayerscopeConfig, layers: Layer[]): LayerscopeConfig {
  if (config.preset === undefined) {
    return config;
  }
  const names = layers.map(layer => layer.name).filter(name => name !== 'root');
  const allow = allowed[config.preset](names);
  const filled = Object.fromEntries(
    names.map((name, index) => [name, { allow: allow[index], ...config.layers?.[name] }]),
  );
  return { ...config, layers: { ...config.layers, ...filled } };
}
