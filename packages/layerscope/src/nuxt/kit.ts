import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { dirname, join } from 'pathe';

import { realPath } from '#src/utils/fs.ts';

export interface NuxtLayerConfig {
  rootDir?: string;
  srcDir?: string;
  serverDir?: string;
  components?: unknown;
  imports?: { scan?: boolean; dirs?: unknown[] };
  dir?: { shared?: string; modules?: string; public?: string };
  $meta?: { name?: string };
}

export interface NuxtLayer {
  cwd: string;
  config: NuxtLayerConfig;
  meta?: { name?: string };
}

export interface NuxtOptions {
  _layers: NuxtLayer[];
  rootDir?: string;
  ignoreOptions?: Record<string, unknown>;
  /** Absolute. Kit resolves it, so a `buildDir` of `nuxt.config` is already applied. */
  buildDir?: string;
  serverDir?: string;
  dir?: { shared?: string };
}

/** Resolved directories of one layer; kit adds a trailing slash to each. */
export interface LayerDirectories {
  root: string;
  app: string;
  server: string;
  shared: string;
  modules: string;
  public: string;
}

export interface NuxtKit {
  loadNuxtConfig: (opts: {
    cwd: string;
    overrides?: Record<string, unknown>;
  }) => Promise<NuxtOptions>;
  /** Missing from older `@nuxt/kit` releases; reads only `nuxt.options`. */
  getLayerDirectories?: (nuxt: { options: NuxtOptions }) => LayerDirectories[];
  /** Missing from older `@nuxt/kit` releases. */
  runWithNuxtContext?: <T>(nuxt: { options: NuxtOptions }, fn: () => T) => T;
  /** Reads `nuxt.options` of the Nuxt in the context. Missing from older `@nuxt/kit` releases. */
  resolveIgnorePatterns?: () => string[];
}

function findPackageDir(from: string, name: string): string | null {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) {
      return realPath(candidate);
    }
    if (dirname(dir) === dir) {
      return null;
    }
  }
}

/**
 * Whether the Nuxt of the project scans `types` in `srcDir` for auto-imports, as Nuxt 4.6 and
 * later do. `false` when no `nuxt` package is found, or its package.json has no string `version`
 * that starts with a major and a minor number. A package.json that is not an object or not JSON
 * throws.
 */
export function nuxtScansSrcTypes(rootDir: string): boolean {
  const dir = findPackageDir(rootDir, 'nuxt');
  if (dir === null) {
    return false;
  }
  const { version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    version?: unknown;
  };
  const match = typeof version === 'string' ? /^(\d+)\.(\d+)\./u.exec(version) : null;
  if (match === null) {
    return false;
  }
  const [major, minor] = [Number(match[1]), Number(match[2])];
  return major > 4 || (major === 4 && minor >= 6);
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
