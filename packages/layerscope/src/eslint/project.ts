import { existsSync, statSync } from 'node:fs';

import { dirname, join, resolve } from 'pathe';

import { findConfigFile } from '#src/config/load.ts';
import { REGISTRY_FILE } from '#src/registry/schema.ts';

import type { ProjectLoad } from './load-project.ts';
import { loadProject } from './load-project.ts';

export const DEFAULT_REGISTRY = join('.nuxt', REGISTRY_FILE);

/** Editors keep the linter running, so a project is reloaded when its inputs change. */
const cache = new Map<string, { stamp: string; load: ProjectLoad }>();

/** The nearest directory from `startDir` up that holds a registry. */
export function findProjectRoot(startDir: string): string | null {
  for (let dir = startDir; ; dir = dirname(dir)) {
    if (existsSync(join(dir, DEFAULT_REGISTRY))) {
      return dir;
    }
    if (dirname(dir) === dir) {
      return null;
    }
  }
}

function mtime(file: string | null): number {
  return file !== null && existsSync(file) ? statSync(file).mtimeMs : 0;
}

function tryLoadProject(rootDir: string): ProjectLoad {
  try {
    return loadProject(rootDir);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

/** The Nuxt project a linted file belongs to, from its registry; Nuxt itself is never loaded. */
export function projectFor(file: string, root: string | undefined): ProjectLoad {
  const rootDir = root === undefined ? findProjectRoot(dirname(file)) : resolve(root);
  if (rootDir === null) {
    return {
      ok: false,
      message: `No ${DEFAULT_REGISTRY} above this file. Run "nuxi prepare", or set the rule's "root" option to the Nuxt project.`,
    };
  }
  const configFile = findConfigFile(rootDir);
  const registry = join(rootDir, DEFAULT_REGISTRY);
  const stamp = `${mtime(configFile)}:${mtime(registry)}`;
  const cached = cache.get(rootDir);
  if (cached?.stamp === stamp) {
    return cached.load;
  }
  const load = tryLoadProject(rootDir);
  cache.set(rootDir, { stamp, load });
  return load;
}
