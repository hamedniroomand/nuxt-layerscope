import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { relative } from 'pathe';
import { escapePath, glob } from 'tinyglobby';

import type { OwnerLookup } from '#src/nuxt/owner.ts';
import { isPackageLayer } from '#src/nuxt/package-layer.ts';
import type { Context, Layer } from '#src/types.ts';
import { compareStrings } from '#src/utils/strings.ts';

const SOURCE_GLOB = '**/*.{vue,ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const SOURCE_EXTENSIONS = new Set([
  '.vue',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);
const NUXT_CONFIG = '**/nuxt.config.*';
const CONFIG_DIR = '**/.config/**';
// c12 also loads `.config/nuxt.config.*` and `.config/nuxt.*`.
const NUXT_CONFIG_FILES = ['ts', 'js', 'mjs', 'mts', 'cjs', 'cts'].flatMap(ext => [
  `nuxt.config.${ext}`,
  `.config/nuxt.config.${ext}`,
  `.config/nuxt.${ext}`,
]);
const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.nuxt/**',
  '**/.output/**',
  '**/dist/**',
  '**/*.d.ts',
  '**/*.d.mts',
  '**/*.d.cts',
  NUXT_CONFIG,
  CONFIG_DIR,
  '**/*.{test,spec}.*',
  '**/__tests__/**',
];

/** Matched against the path relative to the layer root: the config file lives there only. */
const ROOT_IGNORE = 'layerscope.config.*';

function scannedDirs(layer: Layer): string[] {
  // Layers installed from npm are dependencies: their code is resolved, not checked.
  if (isPackageLayer(layer)) {
    return [];
  }
  return [...new Set([layer.srcDir, layer.serverDir, layer.sharedDir])].filter(dir =>
    existsSync(dir),
  );
}

function isInside(dir: string, file: string): boolean {
  return file.startsWith(`${dir}/`);
}

/**
 * The one rule for what a layer skips. `collectFiles` and `isCheckedFile` both use it, so they
 * cannot differ. The Nuxt `modules` and `public` dirs come from Nuxt, because their place depends
 * on the Nuxt version: they are in the root for Nuxt 4 and in `srcDir` for Nuxt 3.
 */
function isSkipped(
  file: string,
  dir: string,
  layer: Layer,
  ignore: string[],
  extra = false,
): boolean {
  // `unused` reads `nuxt.config.*` and the `modules` dir too (`extra`), so that their uses count.
  if ((!extra && isInside(layer.modulesDir, file)) || isInside(layer.publicDir, file)) {
    return true;
  }
  // A source dir of any layer can be outside its root: then the path is `../...`, which never
  // matches.
  if (isInside(layer.root, file) && path.matchesGlob(relative(layer.root, file), ROOT_IGNORE)) {
    return true;
  }
  const relativePath = relative(dir, file);
  const defaults = extra
    ? DEFAULT_IGNORE.filter(pattern => pattern !== NUXT_CONFIG && pattern !== CONFIG_DIR)
    : DEFAULT_IGNORE;
  return [...defaults, ...ignore].some(pattern => path.matchesGlob(relativePath, pattern));
}

/**
 * The Nuxt modules and public dirs inside a scanned dir, as globs, so the walk does not enter them.
 * They are the same dirs that `isSkipped` skips, which stays the one rule.
 */
export function skippedDirGlobs(dir: string, layer: Layer): string[] {
  return (
    [layer.modulesDir, layer.publicDir]
      // A backslash cannot be made literal in a glob on POSIX, and `relative` turns it into a
      // separator, so the glob could skip more than `isSkipped` does. Such a dir is only filtered,
      // after the walk.
      .filter(skipped => isInside(dir, skipped) && !skipped.includes('\\'))
      .map(skipped => `${escapePath(relative(dir, skipped))}/**`)
  );
}

/** Whether `collectFiles` would pick up this file of the given layer. */
export function isCheckedFile(file: string, layer: Layer, ignore: string[]): boolean {
  const dir = scannedDirs(layer).find(candidate => isInside(candidate, file));
  if (dir === undefined) {
    return false;
  }
  return path.matchesGlob(relative(dir, file), SOURCE_GLOB) && !isSkipped(file, dir, layer, ignore);
}

/** Source files of every layer, sorted, mapped to the layer that owns them. */
export async function collectFiles(
  layers: Layer[],
  ownerOf: OwnerLookup,
  ignore: string[],
): Promise<Map<string, Layer>> {
  const jobs = layers.flatMap(layer =>
    scannedDirs(layer).map(async dir => {
      const found = await glob(SOURCE_GLOB, {
        cwd: dir,
        absolute: true,
        ignore: [...DEFAULT_IGNORE, ...ignore, ...skippedDirGlobs(dir, layer)],
      });
      // A Nuxt 3 root scans its whole root dir, which also holds nested layers.
      return found
        .filter(file => ownerOf(file) === layer && !isSkipped(file, dir, layer, ignore))
        .map(file => [file, layer] as const);
    }),
  );
  const entries = (await Promise.all(jobs)).flat();
  return new Map(entries.toSorted(([a], [b]) => compareStrings(a, b)));
}

export const CONTEXTS: Context[] = ['app', 'server', 'shared'];

export function contextOf(file: string, layer: Layer): Context {
  if (file.startsWith(`${layer.serverDir}/`)) {
    return 'server';
  }
  if (file.startsWith(`${layer.sharedDir}/`)) {
    return 'shared';
  }
  return 'app';
}

/**
 * Whether `unused` reads this file although `collectFiles` did not pick it up: a file of a project
 * layer that is a source file and is not skipped, for example `nuxt.config.*`, a file in the
 * `modules` dir or a file outside the source dirs. The `ignore` patterns, test files and type
 * declarations stay skipped. `known` holds the real paths of the files that are already read.
 */
export function isExtraFile(
  file: string,
  ownerOf: OwnerLookup,
  ignore: string[],
  known: Set<string>,
): Layer | null {
  const layer = ownerOf(file);
  if (layer === null || isPackageLayer(layer) || known.has(file)) {
    return null;
  }
  const dir = scannedDirs(layer).find(candidate => isInside(candidate, file)) ?? layer.root;
  // Not the glob: it does not match a file in a dot dir such as `.config/`.
  const isSource = SOURCE_EXTENSIONS.has(path.extname(file));
  return isSource && !isSkipped(file, dir, layer, ignore, true) ? layer : null;
}

/** A dir that `unused` could not list, with the code of the error. */
export interface DeniedDir {
  dir: string;
  layer: Layer;
  cause: string;
}

type DirState = { kind: 'listable' } | { kind: 'missing' } | { kind: 'denied'; cause: string };

/** Whether the dir can be listed, is not there, or fails for another reason. */
function dirState(dir: string): DirState {
  try {
    readdirSync(dir);
    return { kind: 'listable' };
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    return code === 'ENOENT' || code === 'ENOTDIR'
      ? { kind: 'missing' }
      : { kind: 'denied', cause: typeof code === 'string' ? code : String(error) };
  }
}

/**
 * The files that `unused` reads first: `nuxt.config.*`, local modules and symbol files. A config
 * file that is not there is skipped when it is read. A `modules` dir that cannot be listed is
 * returned in `denied`, so that it is shown as unread.
 */
export async function extraSeeds(
  layers: Layer[],
  ownerOf: OwnerLookup,
  files: string[],
): Promise<{ files: string[]; denied: DeniedDir[] }> {
  const found = new Set(files);
  const denied: DeniedDir[] = [];
  for (const layer of layers.filter(item => !isPackageLayer(item))) {
    for (const name of NUXT_CONFIG_FILES) {
      found.add(`${layer.root}/${name}`);
    }
    const state = dirState(layer.modulesDir);
    if (state.kind === 'listable') {
      // eslint-disable-next-line no-await-in-loop -- one small dir at a time
      for (const file of await glob(SOURCE_GLOB, {
        cwd: layer.modulesDir,
        absolute: true,
        ignore: DEFAULT_IGNORE,
      })) {
        found.add(file);
      }
    } else if (state.kind === 'denied') {
      denied.push({ dir: layer.modulesDir, layer, cause: state.cause });
    }
  }
  return {
    files: [...found].filter(file => ownerOf(file) !== null).toSorted(compareStrings),
    denied,
  };
}
