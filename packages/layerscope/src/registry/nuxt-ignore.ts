import ignore from 'ignore';
import type { Options } from 'ignore';
import { relative } from 'pathe';

/** The ignore rules of Nuxt, as the module reads them from `@nuxt/kit`. */
export interface NuxtIgnore {
  /** `nuxt.options.rootDir`. */
  rootDir: string;
  /** The `root` of each layer from `getLayerDirectories()`, with the trailing slash of kit. */
  roots: string[];
  /** The result of `resolveIgnorePatterns()`: `ignore`, `ignorePrefix` and the root `.nuxtignore`. */
  patterns: string[];
  /** `nuxt.options.ignoreOptions`, or `null` when it is not set. */
  options: Record<string, unknown> | null;
}

/**
 * The test that tells if Nuxt ignores a file. It is a copy of `isIgnored()` of `@nuxt/kit`: kit
 * has no form of it that runs without a Nuxt instance, and the CLI has no Nuxt instance.
 */
export function createNuxtIgnore(rules: NuxtIgnore): (file: string) => boolean {
  const matcher = ignore((rules.options ?? undefined) as Options | undefined).add(rules.patterns);
  const roots = rules.roots.toSorted((a, b) => b.length - a.length);
  return file => {
    for (const root of roots) {
      if (file.startsWith(root)) {
        const rest = file.slice(root.length);
        return rest !== '' && matcher.ignores(rest);
      }
    }
    const rest = relative(rules.rootDir, file);
    if (rest.startsWith('..')) {
      return false;
    }
    return rest !== '' && matcher.ignores(rest);
  };
}
