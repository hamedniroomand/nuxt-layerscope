import { allowedLayers } from '#src/config/allow.ts';
import { LayerscopeError } from '#src/errors.ts';
import { LayerConfigError } from '#src/layer-config-error.ts';
import type { Layer, LayerscopeConfig } from '#src/types.ts';

function assertUniqueNames(layers: Layer[]): Set<string> {
  const roots = new Map<string, string>();
  for (const layer of layers) {
    const other = roots.get(layer.name);
    if (other !== undefined) {
      throw new LayerscopeError(
        `Two layers are named "${layer.name}" (${other} and ${layer.root}). Set "path" in layerscope.config.ts to tell them apart.`,
      );
    }
    roots.set(layer.name, layer.root);
  }
  return new Set(roots.keys());
}

export function validateLayers(layers: Layer[], config: LayerscopeConfig): void {
  const names = assertUniqueNames(layers);
  for (const [name, rule] of Object.entries(config.layers ?? {})) {
    if (!names.has(name)) {
      const known = [...names].toSorted().join(', ');
      throw new LayerConfigError(`Unknown layer "${name}" in config. Known layers: ${known}`);
    }
    const unknown = allowedLayers(rule.allow ?? []).find(allowed => !names.has(allowed));
    if (unknown !== undefined) {
      throw new LayerConfigError(`layers.${name}.allow: unknown layer "${unknown}"`);
    }
  }
}
