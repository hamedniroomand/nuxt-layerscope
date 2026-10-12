import { sourceDirsOutsideRoot } from '#src/nuxt/owner.ts';
import type { Layer } from '#src/types.ts';

import { createIgnore, isConfigFile } from './ignore.ts';

export interface Change {
  path: string;
  /** A config file changed: drop the caches. */
  config: boolean;
}

export interface Watcher {
  /** Paths outside the project root (layer roots and source dirs), known after the first run. */
  add: (paths: string[]) => void;
  close: () => Promise<void>;
}

export type StartWatcher = (
  paths: string[],
  buildDir: string,
  onChange: (change: Change) => void,
) => Promise<Watcher>;

/** The root of each layer, and the source dirs of a layer that are outside its root. */
export function layerDirs(layers: Layer[]): string[] {
  return layers.flatMap(layer => [layer.root].concat(sourceDirsOutsideRoot(layer)));
}

/** Watches the paths until closed. Resolves once the first scan is done, so no edit is missed. */
export const startWatcher: StartWatcher = async (paths, buildDir, onChange) => {
  // Loaded here, so a one-shot check and the API never load it.
  const { watch } = await import('chokidar');
  const watcher = watch(paths, {
    ignoreInitial: true,
    ignored: createIgnore(buildDir),
  });
  for (const event of ['add', 'change', 'unlink'] as const) {
    watcher.on(event, path => {
      onChange({ path, config: isConfigFile(path) });
    });
  }
  await new Promise<void>((resolve, reject) => {
    watcher.once('ready', resolve);
    watcher.once('error', reject);
  });
  return {
    add: (more): void => {
      watcher.add(more);
    },
    close: async (): Promise<void> => {
      await watcher.close();
    },
  };
};
