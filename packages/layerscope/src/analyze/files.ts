import { existsSync } from 'node:fs';
import path from 'node:path';

import { relative } from 'pathe';
import { glob } from 'tinyglobby';

import type { OwnerLookup } from '#src/nuxt/owner.ts';
import type { Context, Layer } from '#src/types.ts';
import { compareStrings } from '#src/utils/strings.ts';

const SOURCE_GLOB = '**/*.{vue,ts,tsx,mts,js,jsx,mjs}';
const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.nuxt/**',
  '**/.output/**',
  '**/dist/**',
  '**/*.d.ts',
  '**/*.d.mts',
  '**/nuxt.config.*',
  '**/.config/**',
  '**/*.{test,spec}.*',
  '**/__tests__/**',
  'modules/**',
  'public/**',
  'layerscope.config.*',
];

function scannedDirs(layer: Layer): string[] {
  // Layers installed from npm are dependencies: their code is resolved, not checked.
  if (layer.root.includes('/node_modules/')) {
    return [];
  }
  return [...new Set([layer.srcDir, layer.serverDir, layer.sharedDir])].filter(dir =>
    existsSync(dir),
  );
}

/** Whether `collectFiles` would pick up this file of the given layer. */
export function isCheckedFile(file: string, layer: Layer, ignore: string[]): boolean {
  const dir = scannedDirs(layer).find(candidate => file.startsWith(`${candidate}/`));
  if (dir === undefined) {
    return false;
  }
  const relativePath = relative(dir, file);
  return (
    path.matchesGlob(relativePath, SOURCE_GLOB) &&
    ![...DEFAULT_IGNORE, ...ignore].some(pattern => path.matchesGlob(relativePath, pattern))
  );
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
        ignore: [...DEFAULT_IGNORE, ...ignore],
      });
      // A Nuxt 3 root scans its whole root dir, which also holds nested layers.
      return found.filter(file => ownerOf(file) === layer).map(file => [file, layer] as const);
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
