import { existsSync } from 'node:fs';
import path from 'node:path';

import { relative } from 'pathe';
import { escapePath, glob } from 'tinyglobby';

import type { OwnerLookup } from '#src/nuxt/owner.ts';
import type { Context, Layer } from '#src/types.ts';
import { compareStrings } from '#src/utils/strings.ts';

const SOURCE_GLOB = '**/*.{vue,ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.nuxt/**',
  '**/.output/**',
  '**/dist/**',
  '**/*.d.ts',
  '**/*.d.mts',
  '**/*.d.cts',
  '**/nuxt.config.*',
  '**/.config/**',
  '**/*.{test,spec}.*',
  '**/__tests__/**',
];

/** Matched against the path relative to the layer root: the config file lives there only. */
const ROOT_IGNORE = 'layerscope.config.*';

function scannedDirs(layer: Layer): string[] {
  // Layers installed from npm are dependencies: their code is resolved, not checked.
  if (layer.root.includes('/node_modules/')) {
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
function isSkipped(file: string, dir: string, layer: Layer, ignore: string[]): boolean {
  if (isInside(layer.modulesDir, file) || isInside(layer.publicDir, file)) {
    return true;
  }
  // A root `serverDir` from the options can be outside the root: `../` never matches.
  if (isInside(layer.root, file) && path.matchesGlob(relative(layer.root, file), ROOT_IGNORE)) {
    return true;
  }
  const relativePath = relative(dir, file);
  return [...DEFAULT_IGNORE, ...ignore].some(pattern => path.matchesGlob(relativePath, pattern));
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

export function contextOf(file: string, layer: Layer): Context {
  if (file.startsWith(`${layer.serverDir}/`)) {
    return 'server';
  }
  if (file.startsWith(`${layer.sharedDir}/`)) {
    return 'shared';
  }
  return 'app';
}
