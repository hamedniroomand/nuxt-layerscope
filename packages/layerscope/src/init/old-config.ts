import { relative } from 'pathe';

import { loadConfig } from '#src/config/load.ts';
import type { LayerscopeConfig } from '#src/types.ts';
import { currentDir } from '#src/utils/fs.ts';

/** The config that exists, its path for messages, and the notes about what the new config loses. */
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
    const config = await loadConfig(rootDir, existing);
    const layerKeys = Object.values(config.layers ?? {}).some(
      layer => layer.expose !== undefined || layer.path !== undefined || layer.source !== undefined,
    );
    const notes = layerKeys
      ? [
          `The new config does not keep the expose, path and source keys of the layers in ${file}. Add them again by hand.`,
        ]
      : [];
    return { config, file, notes };
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

/**
 * The config for the analysis of `init --force`: the kept keys that change the findings and the
 * edges. `layers` and `preset` are not used: the new `layers` map sets `allow` for every layer, so
 * the preset fills nothing. `baseline` is not used: the new baseline must have every finding.
 */
export function analysisConfig(kept: OldConfig | undefined, buildDir: string): LayerscopeConfig {
  const keys = Object.entries(kept?.config ?? {}).filter(
    ([key]) => key !== 'layers' && key !== 'preset' && key !== 'baseline',
  );
  return { ...Object.fromEntries(keys), buildDir };
}
