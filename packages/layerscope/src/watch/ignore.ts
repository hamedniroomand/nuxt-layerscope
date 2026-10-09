import { normalize, relative } from 'pathe';

import { WATCHED } from '#src/devtools/env-key.ts';

// Layers inside `node_modules` (published layers) are left out with the rest of it.
const SKIPPED = new Set(['node_modules', '.git', '.output', 'dist', '.data', '.nitro']);

const BUILD_DIRS = new Set(WATCHED.flatMap(name => name.split('/').slice(0, -1)));

/**
 * What the watcher does not enter. Inside the build dir only the files that the environment key
 * reads are kept: `nuxi dev` writes many others, and none of them changes the result.
 */
export function createIgnore(buildDir: string): (path: string) => boolean {
  return raw => {
    // chokidar gives native separators, backslashes on Windows.
    const path = normalize(raw);
    const inBuild = relative(buildDir, path);
    if (!inBuild.startsWith('..')) {
      return !(inBuild === '' || BUILD_DIRS.has(inBuild) || WATCHED.some(name => name === inBuild));
    }
    return path.split('/').some(part => SKIPPED.has(part));
  };
}

const CONFIG_FILE = /(?:^|\/)(?:nuxt|layerscope)\.config\.[cm]?[jt]s$/u;

/** A config file of any layer: the loaded layers and rules may change, so the next run is full. */
export function isConfigFile(path: string): boolean {
  return CONFIG_FILE.test(normalize(path));
}
