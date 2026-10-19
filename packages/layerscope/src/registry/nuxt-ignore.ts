import ignore from 'ignore';
import type { Options } from 'ignore';
import { relative } from 'pathe';

/** The ignore rules of Nuxt, as the module or the CLI reads them from `@nuxt/kit`. */
export interface NuxtIgnore {
  /** `nuxt.options.rootDir`. */
  rootDir: string;
  /**
   * The root of each layer, with a trailing slash. The module takes them from
   * `getLayerDirectories()`. The CLI uses the real path of each layer.
   */
  roots: string[];
  /** The result of `resolveIgnorePatterns()`: `ignore`, `ignorePrefix` and the root `.nuxtignore`. */
  patterns: string[];
  /** `nuxt.options.ignoreOptions`, or `null` when it is not set. */
  options: Record<string, unknown> | null;
}

/**
 * The test that tells if Nuxt ignores a file. It is a copy of `isIgnored()` of `@nuxt/kit`: kit
 * has no form of it that runs without a Nuxt instance, and the CLI has no Nuxt instance. The copy
 * matches `isIgnored()` of kit 3.21 and 4.5, the kits of the oracle test. Older kits (for example
 * 4.0.x) make the path relative to the cwd of the layer, with no trailing slash. So for a dir next
 * to a layer with the same prefix (`layers/ui-extra` next to `layers/ui`), the result can differ.
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
