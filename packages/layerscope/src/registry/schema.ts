import type { ProjectConfig } from '#src/config/effective.ts';
import type { Context, Layer } from '#src/types.ts';

import type { NuxtIgnore } from './nuxt-ignore.ts';

/** Bumped on breaking changes to `registry.json`; readers fall back to the `.d.ts` files. */
export const REGISTRY_VERSION = 1;

/** Relative to the Nuxt build dir. */
export const REGISTRY_FILE = 'layerscope/registry.json';

export type ComponentMode = 'all' | 'client' | 'server';

export interface RegistryComponent {
  /** PascalCase name, without the `Lazy` prefix. */
  name: string;
  /** Absolute path, or a bare module specifier for virtual components. */
  file: string;
  mode: ComponentMode;
  island: boolean;
  priority: number;
}

/** A component that lost to a higher-priority one with the same name. */
export interface ShadowedComponent extends RegistryComponent {
  /** File of the component Nuxt registered instead. */
  shadowedBy: string;
}

export interface RegistryComponentDir {
  path: string;
  /** Glob Nuxt scans the dir with, relative to `path`. */
  pattern: string | string[];
  ignore: string[];
  /** Files matched when the registry was written, for the stale check. */
  files: string[];
}

export interface RegistryImportDir {
  /** The dir that Nuxt or Nitro scans for auto-imports, or the glob when the user gave one. */
  dir: string;
  /** The absolute globs that the scan used for the dir. */
  globs: string[];
  /**
   * The scan of the dir: `nuxt` for the app, `nitro` for Nitro. Only the scan of the app uses the
   * ignore rules of Nuxt.
   */
  scanner: 'nuxt' | 'nitro';
  /** Files that the globs matched when the registry was written, before Nuxt's ignore rules. */
  files: string[];
}

export interface RegistryImport {
  /** Name the symbol is auto-imported as. */
  name: string;
  /** Absolute path once aliases are resolved, or a bare module specifier. */
  from: string;
}

export interface Registry {
  version: typeof REGISTRY_VERSION;
  generator: { name: string; version: string; nuxt: string };
  /** Highest priority first, as Nuxt orders `_layers`. Older releases wrote no `modulesDir` or `publicDir`. */
  layers: Layer[];
  components: RegistryComponent[];
  shadowedComponents: ShadowedComponent[];
  componentDirs: RegistryComponentDir[];
  /**
   * Every dir that Nuxt or Nitro scans for auto-imports, for the stale check. `null` when the
   * module could not read them (it printed the reason): the check is off for this file.
   */
  importDirs: RegistryImportDir[] | null;
  /** The ignore rules of Nuxt. The stale check skips the new files that they match. */
  nuxtIgnore: NuxtIgnore;
  imports: Record<Context, RegistryImport[]>;
  /** The `layerscope` key of `nuxt.config`, when it sets layers or rules. Added in 0.1.0. */
  config?: ProjectConfig;
}
