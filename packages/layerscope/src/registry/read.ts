import { existsSync } from 'node:fs';

import { join } from 'pathe';

import { recordedOptions } from '#src/config/effective.ts';
import type { ComponentMap, SymbolMap, SymbolTable } from '#src/nuxt/symbols.ts';
import { addComponent, targetOf } from '#src/nuxt/symbols.ts';
import { readJson } from '#src/utils/fs.ts';

import type { Registry, RegistryImport } from './schema.ts';
import { REGISTRY_FILE, REGISTRY_VERSION } from './schema.ts';

export type RegistryRead =
  | { kind: 'ok'; file: string; registry: Registry }
  | { kind: 'missing'; file: string }
  /** Written by a layerscope release with another schema. */
  | { kind: 'incompatible'; file: string; version: unknown }
  /** Same schema version, but the file lacks a field that this release needs. */
  | { kind: 'stale'; file: string; registry: Registry };

function isStrings(value: unknown): boolean {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/** The check of a stored entry: the type of each field, because the file is not trusted. */
function isImportDir(entry: unknown): boolean {
  if (typeof entry !== 'object' || entry === null) {
    return false;
  }
  const record = entry as Record<string, unknown>;
  // The module always writes at least one glob, so an entry without one is damaged.
  const hasGlobs = Array.isArray(record.globs) && record.globs.length > 0;
  return (
    typeof record.dir === 'string' &&
    hasGlobs &&
    isStrings(record.globs) &&
    (record.scanner === 'nuxt' || record.scanner === 'nitro') &&
    isStrings(record.files)
  );
}

/** The check of the stored ignore rules of Nuxt: the type of each field, as for a dir. */
function isNuxtIgnore(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const { options } = record;
  const hasOptions = options === null || (typeof options === 'object' && !Array.isArray(options));
  return (
    typeof record.rootDir === 'string' &&
    isStrings(record.roots) &&
    isStrings(record.patterns) &&
    hasOptions
  );
}

/** The check of the fields of a stored component that only the `unused` marks read. */
function isComponent(entry: unknown): boolean {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    typeof (entry as Record<string, unknown>).global === 'boolean'
  );
}

/** The check of a stored shadowed layout or middleware: the type of each field. */
function isShadowedFiles(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(entry => {
      if (typeof entry !== 'object' || entry === null) {
        return false;
      }
      const record = entry as Record<string, unknown>;
      return (
        typeof record.name === 'string' &&
        typeof record.file === 'string' &&
        typeof record.shadowedBy === 'string'
      );
    })
  );
}

/** The check of a stored component dir: the type of each field, as for an auto-import dir. */
function isComponentDir(entry: unknown): boolean {
  if (typeof entry !== 'object' || entry === null) {
    return false;
  }
  const record = entry as Record<string, unknown>;
  const hasPattern = typeof record.pattern === 'string' || isStrings(record.pattern);
  return (
    typeof record.path === 'string' &&
    hasPattern &&
    isStrings(record.ignore) &&
    isStrings(record.files)
  );
}

/**
 * Whether the file has each field that this release needs, with the right type: `modulesDir` or
 * `publicDir` of a layer (layerscope would scan the Nuxt modules and public dirs), `importDirs`
 * and `nuxtIgnore` (the stale check of new files), `global` of a component and `nuxtContent` (the
 * "possibly used" marks of `unused`), and `shadowedLayouts` and `shadowedMiddleware` (the shadowed
 * rules). A file without one is stale, or damaged, for example with a bad entry in
 * `componentDirs`.
 */
function isComplete(registry: Record<string, unknown>): boolean {
  const {
    layers,
    components,
    componentDirs,
    importDirs,
    nuxtIgnore,
    nuxtContent,
    shadowedLayouts,
    shadowedMiddleware,
  } = registry;
  return (
    Array.isArray(layers) &&
    layers.every(
      (layer: Record<string, unknown> | null) =>
        typeof layer?.modulesDir === 'string' && typeof layer.publicDir === 'string',
    ) &&
    Array.isArray(componentDirs) &&
    componentDirs.every(entry => isComponentDir(entry)) &&
    Array.isArray(components) &&
    components.every(entry => isComponent(entry)) &&
    typeof nuxtContent === 'boolean' &&
    isShadowedFiles(shadowedLayouts) &&
    isShadowedFiles(shadowedMiddleware) &&
    isNuxtIgnore(nuxtIgnore) &&
    (importDirs === null ||
      (Array.isArray(importDirs) && importDirs.every(entry => isImportDir(entry))))
  );
}

export function readRegistry(buildDir: string): RegistryRead {
  const file = join(buildDir, REGISTRY_FILE);
  if (!existsSync(file)) {
    return { kind: 'missing', file };
  }
  const registry = readJson(file) as { version?: unknown };
  if (registry.version !== REGISTRY_VERSION) {
    return { kind: 'incompatible', file, version: registry.version };
  }
  // The layers of a stale file are not used, but its `config` is kept: the `layerscope` options of
  // `nuxt.config` are only stored there.
  const config = recordedOptions((registry as { config?: unknown }).config, file);
  return {
    kind: isComplete(registry as Record<string, unknown>) ? 'ok' : 'stale',
    file,
    registry: { ...(registry as Registry), config },
  };
}

function importMap(imports: RegistryImport[], buildDir: string): SymbolMap {
  return new Map(imports.map(entry => [entry.name, targetOf(entry.from, buildDir)]));
}

/** The files of the global components, as the symbol table has them. */
export function globalComponentFiles(registry: Registry, buildDir: string): string[] {
  return registry.components
    .filter(component => component.global)
    .flatMap(component => targetOf(component.file, buildDir).file ?? []);
}

/** The same table the `.d.ts` parser builds, from Nuxt's own registry. */
export function tableFromRegistry(registry: Registry, buildDir: string): SymbolTable {
  const components: ComponentMap = new Map();
  const lazy: ComponentMap = new Map();
  for (const component of registry.components) {
    const target = targetOf(component.file, buildDir);
    addComponent(components, component.name, target);
    addComponent(lazy, `Lazy${component.name}`, target);
  }
  return {
    imports: {
      app: importMap(registry.imports.app, buildDir),
      server: importMap(registry.imports.server, buildDir),
      shared: importMap(registry.imports.shared, buildDir),
    },
    components: new Map([...components, ...lazy]),
  };
}
