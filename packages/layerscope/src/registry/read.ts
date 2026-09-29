import { existsSync } from 'node:fs';

import { join } from 'pathe';

import type { SymbolMap, SymbolTable } from '#src/nuxt/symbols.ts';
import { targetOf } from '#src/nuxt/symbols.ts';
import { readJson } from '#src/utils/fs.ts';

import type { Registry, RegistryImport } from './schema.ts';
import { REGISTRY_FILE, REGISTRY_VERSION } from './schema.ts';

export type RegistryRead =
  | { kind: 'ok'; file: string; registry: Registry }
  | { kind: 'missing'; file: string }
  /** Written by a layerscope release with another schema. */
  | { kind: 'incompatible'; file: string; version: unknown };

export function readRegistry(buildDir: string): RegistryRead {
  const file = join(buildDir, REGISTRY_FILE);
  if (!existsSync(file)) {
    return { kind: 'missing', file };
  }
  const registry = readJson(file) as { version?: unknown };
  if (registry.version !== REGISTRY_VERSION) {
    return { kind: 'incompatible', file, version: registry.version };
  }
  return { kind: 'ok', file, registry: registry as Registry };
}

function importMap(imports: RegistryImport[], buildDir: string): SymbolMap {
  return new Map(imports.map(entry => [entry.name, targetOf(entry.from, buildDir)]));
}

/** The same table the `.d.ts` parser builds, from Nuxt's own registry. */
export function tableFromRegistry(registry: Registry, buildDir: string): SymbolTable {
  const components: SymbolMap = new Map();
  const lazy: SymbolMap = new Map();
  for (const component of registry.components) {
    const target = targetOf(component.file, buildDir);
    components.set(component.name, target);
    lazy.set(`Lazy${component.name}`, target);
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
