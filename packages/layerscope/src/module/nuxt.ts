import type { Component, ComponentsDir, Nuxt } from '@nuxt/schema';

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
}

export interface Nitro {
  unimport?: Unimport;
  options: { alias?: Record<string, string> };
}

type NitroInitHook = (name: 'nitro:init', handler: (nitro: Nitro) => void) => unknown;

/** `nitro:init` is typed by Nuxt's Nitro integration, not by `@nuxt/schema`. */
export function onNitroInit(nuxt: Nuxt, handler: (nitro: Nitro) => void): void {
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
