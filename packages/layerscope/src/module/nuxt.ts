import {
  getLayerDirectories,
  hasNuxtModule,
  resolveIgnorePatterns,
  runWithNuxtContext,
} from '@nuxt/kit';
import type { Component, ComponentsDir, Nuxt } from '@nuxt/schema';

import type { NuxtIgnore } from '#src/registry/nuxt-ignore.ts';

import type { ScanDir, ScanOptions } from './import-dirs.ts';

export type { Component, ComponentsDir, Nuxt };

/** The slice of unimport the module reads, for app and server auto-imports alike. */
export interface UnimportImport {
  name: string;
  as?: string;
  from: string;
  type?: boolean;
  disabled?: boolean;
}

export interface Unimport {
  getImports: () => Promise<UnimportImport[]>;
  /** Scans the configured dirs; Nitro calls it before writing its types. */
  init?: () => Promise<void>;
  /**
   * Scans the dirs of the instance again, as `init()` does, and gives the imports of this scan.
   * An older unimport can lack it.
   */
  scanImportsFromDir?: () => Promise<UnimportImport[]>;
  /**
   * The state of the instance. `options.dirs` are the dirs that `init()` scans. `getImports()`
   * dedupes `staticImports` (with the presets) and `dynamicImports` (from the scans and modules).
   */
  getInternalContext?: () => {
    options?: { dirs?: unknown[] } & Record<string, unknown>;
    staticImports?: UnimportImport[];
    dynamicImports?: UnimportImport[];
  };
}

export interface Nitro {
  unimport?: Unimport;
  options: {
    alias?: Record<string, string>;
    /** Nitro gives this object to unimport, so its dirs and scan options are the real ones. */
    imports?: false | { dirs?: ScanDir[]; dirsScanOptions?: ScanOptions };
  };
}

/** The ignore rules of Nuxt, read with the functions that `isIgnored()` of kit uses. */
export function readNuxtIgnore(nuxt: Nuxt): NuxtIgnore {
  // `resolveIgnorePatterns()` reads Nuxt from the context. Without the context, it gives no rules.
  const patterns = runWithNuxtContext(nuxt, () => resolveIgnorePatterns());
  return {
    rootDir: nuxt.options.rootDir,
    roots: getLayerDirectories(nuxt).map(dirs => dirs.root),
    patterns,
    options: (nuxt.options.ignoreOptions as Record<string, unknown> | undefined) ?? null,
  };
}

/** Whether the project installs Nuxt Content, also from a layer, by the check of kit. */
export function usesNuxtContent(nuxt: Nuxt): boolean {
  return hasNuxtModule('@nuxt/content', nuxt);
}

type NitroInitHook = (
  name: 'nitro:init',
  handler: (nitro: Nitro) => Promise<void> | void,
) => unknown;

/** `nitro:init` is typed by Nuxt's Nitro integration, not by `@nuxt/schema`. */
export function onNitroInit(nuxt: Nuxt, handler: (nitro: Nitro) => Promise<void> | void): void {
  (nuxt.hook as unknown as NitroInitHook)('nitro:init', handler);
}

/** The slice of Nuxt DevTools' `ModuleCustomTab` the module registers. */
export interface DevtoolsTab {
  name: string;
  title: string;
  icon: string;
  view: { type: 'iframe'; src: string };
}

type CustomTabsHook = (
  name: 'devtools:customTabs',
  handler: (tabs: DevtoolsTab[]) => void,
) => unknown;

/** Typed by `@nuxt/devtools`, which the module does not depend on. */
export function onDevtoolsCustomTabs(nuxt: Nuxt, handler: (tabs: DevtoolsTab[]) => void): void {
  (nuxt.hook as unknown as CustomTabsHook)('devtools:customTabs', handler);
}
