import { resolve } from 'pathe';

import { LayerscopeError } from '#src/errors.ts';
import type { Layer, LayerscopeConfig } from '#src/types.ts';
import { realPath } from '#src/utils/fs.ts';

import type { NuxtKit } from './kit.ts';
import { loadNuxtKit } from './kit.ts';
import {
  deriveDirectories,
  layerFromNuxt,
  layerFromPath,
  ROOT_LAYER_NAME,
} from './layer-factory.ts';
import { isClonedFrom } from './remote-layer.ts';
import { validateLayers } from './validate-layers.ts';

function configuredPaths(rootDir: string, config: LayerscopeConfig): [string, string][] {
  return Object.entries(config.layers ?? {}).flatMap(([name, rule]) =>
    rule.path === undefined
      ? []
      : [[name, realPath(resolve(rootDir, rule.path))] as [string, string]],
  );
}

function configuredSources(config: LayerscopeConfig): [string, string][] {
  return Object.entries(config.layers ?? {}).flatMap(([name, rule]) =>
    rule.source === undefined ? [] : [[name, rule.source] as [string, string]],
  );
}

function layersFromConfig(rootDir: string, config: LayerscopeConfig): Layer[] {
  const paths = configuredPaths(rootDir, config);
  if (paths.length === 0) {
    throw new LayerscopeError(
      `Could not load @nuxt/kit from ${rootDir}. Install dependencies, or give every layer a "path" in layerscope.config.ts.`,
    );
  }
  const layers = paths.map(([name, root]) => layerFromPath(name, root));
  const root = realPath(resolve(rootDir));
  return layers.some(layer => layer.root === root)
    ? layers
    : [layerFromPath(ROOT_LAYER_NAME, root), ...layers];
}

async function layersFromNuxt(kit: NuxtKit, rootDir: string): Promise<Layer[]> {
  let options: Awaited<ReturnType<NuxtKit['loadNuxtConfig']>> | null = null;
  try {
    options = await kit.loadNuxtConfig({ cwd: rootDir });
  } catch (error) {
    throw new LayerscopeError(`Failed to load Nuxt config: ${(error as Error).message}`);
  }
  const dirs =
    kit.getLayerDirectories?.({ options }) ??
    options._layers.map((layer, index) => deriveDirectories(layer, index, options));
  return options._layers.map((layer, index) => layerFromNuxt(layer, index, dirs[index]));
}

/** `path` in config names the Nuxt layer at that root. */
function applyConfiguredNames(layers: Layer[], rootDir: string, config: LayerscopeConfig): Layer[] {
  const named = layers.map(layer => ({ ...layer }));
  for (const [name, root] of configuredPaths(rootDir, config)) {
    const layer = named.find(candidate => candidate.root === root);
    if (layer === undefined) {
      throw new LayerscopeError(`layers.${name}.path: no Nuxt layer at ${root}`);
    }
    layer.name = name;
  }
  for (const [name, source] of configuredSources(config)) {
    const matches = named.filter(candidate => isClonedFrom(candidate.root, source));
    if (matches.length !== 1) {
      const found = matches.length === 0 ? 'no layer cloned' : 'several layers cloned';
      throw new LayerscopeError(
        `layers.${name}.source: ${found} from "${source}". Set $meta.name in the layer's nuxt.config instead.`,
      );
    }
    matches[0].name = name;
  }
  return named;
}

/** Applies `path` names from config to recorded layers and checks config against them. */
export function nameLayers(layers: Layer[], rootDir: string, config: LayerscopeConfig): Layer[] {
  const named = applyConfiguredNames(layers, rootDir, config);
  validateLayers(named, config);
  return named;
}

/**
 * The ordered layer list, highest priority first. `recorded` are the layers the Nuxt module
 * wrote to the registry; without them the layers come from the project's `@nuxt/kit`.
 */
export async function resolveLayers(
  rootDir: string,
  config: LayerscopeConfig,
  recorded?: Layer[],
): Promise<Layer[]> {
  let layers = recorded;
  if (layers === undefined) {
    const kit = await loadNuxtKit(rootDir);
    layers = kit === null ? layersFromConfig(rootDir, config) : await layersFromNuxt(kit, rootDir);
  }
  return nameLayers(layers, rootDir, config);
}
