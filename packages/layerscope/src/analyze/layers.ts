import { existsSync } from 'node:fs';

import { join, relative } from 'pathe';

import { resolveLayersAndIgnore } from '#src/nuxt/layers.ts';
import type { ResolvedLayers } from '#src/nuxt/layers.ts';
import type { OwnerLookup } from '#src/nuxt/owner.ts';
import { createOwnerLookup } from '#src/nuxt/owner.ts';
import type { Layer, LayerscopeConfig } from '#src/types.ts';

export interface AnalysisLayers extends ResolvedLayers {
  ownerOf: OwnerLookup;
  notes: string[];
}

/**
 * A layer's `srcDir` leaks into a project that does not set its own, so Nuxt then looks for the
 * project's app in a dir that does not exist while `app/` is ignored.
 */
function layerNotes(layers: Layer[], rootDir: string): string[] {
  return layers.flatMap(layer => {
    const appDir = join(layer.root, 'app');
    if (existsSync(layer.srcDir) || !existsSync(appDir)) {
      return [];
    }
    const srcDir = relative(rootDir, layer.srcDir) || '.';
    return [
      `Layer "${layer.name}" has srcDir ${srcDir}, which does not exist, so Nuxt ignores ${relative(rootDir, appDir)}. An extended layer's srcDir may have been merged in; set srcDir in its nuxt.config.`,
    ];
  });
}

/** Layers in priority order, with the lookup of which layer owns a file. */
export async function loadLayers(
  rootDir: string,
  config: LayerscopeConfig,
  registryLayers: Layer[] | undefined,
): Promise<AnalysisLayers> {
  const { layers, isNuxtIgnored } = await resolveLayersAndIgnore(rootDir, config, registryLayers);
  return {
    layers,
    isNuxtIgnored,
    ownerOf: createOwnerLookup(layers),
    notes: layerNotes(layers, rootDir),
  };
}
