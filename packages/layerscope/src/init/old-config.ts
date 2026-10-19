import { relative } from 'pathe';

import { loadConfig } from '#src/config/load.ts';
import type { LayerRule, LayerscopeConfig } from '#src/types.ts';
import { currentDir } from '#src/utils/fs.ts';

/** The config that exists, its path for messages, and the notes about what init could not keep. */
export interface OldConfig {
  config: LayerscopeConfig;
  file: string;
  notes: string[];
}

/** A config that does not load gives no keys, so `--force` can replace a broken file. A note says so. */
export async function readOldConfig(rootDir: string, existing: string | null): Promise<OldConfig> {
  if (existing === null) {
    return { config: {}, file: '', notes: [] };
  }
  const file = relative(currentDir(), existing);
  try {
    return { config: await loadConfig(rootDir, existing), file, notes: [] };
  } catch (error) {
    return {
      config: {},
      file,
      notes: [
        `The new config keeps none of the keys of the old config, because it did not load: ${(error as Error).message}`,
      ],
    };
  }
}

/** The layer keys that --force keeps. path and source name the layer. expose changes the findings. */
const LAYER_KEYS = ['expose', 'path', 'source'] as const;

/** The kept keys of each old layer that has one of them. A layer with only `allow` is not kept. */
export function keptLayers(kept: OldConfig | undefined): Map<string, LayerRule> {
  return new Map(
    Object.entries(kept?.config.layers ?? {}).flatMap(([name, rule]) => {
      const keys = LAYER_KEYS.filter(key => rule[key] !== undefined);
      return keys.length === 0
        ? []
        : [[name, Object.fromEntries(keys.map(key => [key, rule[key]]))] as const];
    }),
  );
}

/**
 * The config for the analysis of `init --force`. It has the kept keys that change the findings, the
 * edges and the layer names. A kept layer has no `allow`, so every layer stays unrestricted and the
 * edges are what exists today. When the analysis does not find a kept layer, `init` stops, as
 * `check` stops. `preset` is not used: the new `layers` map sets `allow` for every layer, so the
 * preset fills nothing. `baseline` is not used: the new baseline must have every finding.
 */
export function analysisConfig(kept: OldConfig | undefined, buildDir: string): LayerscopeConfig {
  const keys = Object.entries(kept?.config ?? {}).filter(
    ([key]) => key !== 'layers' && key !== 'preset' && key !== 'baseline',
  );
  const layers = keptLayers(kept);
  // An empty `layers` map counts as a project key in the check against nuxt.config (layerscope).
  const layerKeys = layers.size === 0 ? {} : { layers: Object.fromEntries(layers) };
  return { ...Object.fromEntries(keys), ...layerKeys, buildDir };
}
