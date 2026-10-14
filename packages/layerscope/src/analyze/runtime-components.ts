import { readFileSync } from 'node:fs';

import { basename, extname, join } from 'pathe';

import type { ComponentMap } from '#src/nuxt/symbols.ts';
import { globalComponentFiles } from '#src/registry/read.ts';
import type { Registry } from '#src/registry/schema.ts';
import type { Layer } from '#src/types.ts';
import { isGone } from '#src/utils/fs.ts';

// `GLOBAL_RE` of Nuxt's `src/components/scan.ts`, on the file name without its extension.
const GLOBAL_SUFFIX = /\.global(?:\.island)?$/u;

// Nuxt writes one such line in `nuxt.d.ts` for each installed module that has types.
const CONTENT_REFERENCE = '/// <reference types="@nuxt/content" />';

/**
 * The global components that the `.d.ts` files show, by the two default rules of Nuxt: the
 * `.global` suffix, and the `components/global/` dir that `normalizeDirs()` of Nuxt's
 * `src/components/module.ts` adds for a layer without a `components` option. A dir that a
 * module or config makes global is not seen.
 */
function globalFilesFromTypes(components: ComponentMap, layers: Layer[]): string[] {
  const dirs = layers
    .filter(layer => layer.defaultComponents)
    .map(layer => `${join(layer.srcDir, 'components/global')}/`);
  const files = new Set(
    [...components.values()].flat().flatMap(target => (target.file === null ? [] : [target.file])),
  );
  return [...files].filter(
    file =>
      GLOBAL_SUFFIX.test(basename(file, extname(file))) || dirs.some(dir => file.startsWith(dir)),
  );
}

/** Whether `nuxt.d.ts` references the types of Nuxt Content, which only an install of it adds. */
function contentFromTypes(buildDir: string): boolean {
  let text: string;
  try {
    text = readFileSync(join(buildDir, 'nuxt.d.ts'), 'utf8');
  } catch (error) {
    if (isGone((error as NodeJS.ErrnoException).code)) {
      return false;
    }
    throw error;
  }
  return text.split('\n').some(line => line.trim() === CONTENT_REFERENCE);
}

export interface RuntimeComponents {
  /** The files of the global components: Vue can render one by a name chosen at runtime. */
  globalComponentFiles: string[];
  /** The project uses Nuxt Content, which can render any component by its name. */
  nuxtContent: boolean;
}

/** What can render a component by a name chosen at runtime: from the registry, or the `.d.ts` files. */
export function runtimeComponents(
  registry: Registry | null,
  components: ComponentMap,
  layers: Layer[],
  buildDir: string,
): RuntimeComponents {
  if (registry !== null) {
    return {
      globalComponentFiles: globalComponentFiles(registry, buildDir),
      nuxtContent: registry.nuxtContent,
    };
  }
  return {
    globalComponentFiles: globalFilesFromTypes(components, layers),
    nuxtContent: contentFromTypes(buildDir),
  };
}
