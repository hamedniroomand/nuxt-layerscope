import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { dirname, join } from 'pathe';

export interface NuxtLayerConfig {
  rootDir?: string;
  srcDir?: string;
  serverDir?: string;
  components?: unknown;
  dir?: { shared?: string };
  $meta?: { name?: string };
}

export interface NuxtLayer {
  cwd: string;
  config: NuxtLayerConfig;
  meta?: { name?: string };
}

export interface NuxtOptions {
  _layers: NuxtLayer[];
  serverDir?: string;
  dir?: { shared?: string };
}

/** Resolved directories of one layer; kit adds a trailing slash to each. */
export interface LayerDirectories {
  root: string;
  app: string;
  server: string;
  shared: string;
}

export interface NuxtKit {
  loadNuxtConfig: (opts: { cwd: string }) => Promise<NuxtOptions>;
  /** Missing from older `@nuxt/kit` releases; reads only `nuxt.options`. */
  getLayerDirectories?: (nuxt: { options: NuxtOptions }) => LayerDirectories[];
}

function findPackageDir(from: string, name: string): string | null {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) {
      return realpathSync(candidate);
    }
    if (dirname(dir) === dir) {
      return null;
    }
  }
}

function packageEntry(dir: string): string {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    exports?: Record<string, unknown>;
    module?: string;
    main?: string;
  };
  let entry: unknown = pkg.exports?.['.'];
  while (typeof entry === 'object' && entry !== null) {
    const conditions = entry as Record<string, unknown>;
    entry = conditions.import ?? conditions.node ?? conditions.default;
  }
  return join(dir, typeof entry === 'string' ? entry : (pkg.module ?? pkg.main ?? 'index.js'));
}

/**
 * Loads `@nuxt/kit` from the project's own Nuxt install rather than bundling one, so the
 * config defaults match the project's Nuxt major version.
 */
export async function loadNuxtKit(rootDir: string): Promise<NuxtKit | null> {
  let kitDir = findPackageDir(rootDir, '@nuxt/kit');
  if (kitDir === null) {
    // Strict layouts (pnpm) only expose kit next to nuxt, not in the project.
    const nuxtDir = findPackageDir(rootDir, 'nuxt');
    kitDir = nuxtDir === null ? null : findPackageDir(nuxtDir, '@nuxt/kit');
  }
  if (kitDir === null) {
    return null;
  }
  return (await import(pathToFileURL(packageEntry(kitDir)).href)) as NuxtKit;
}
