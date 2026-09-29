import { existsSync } from 'node:fs';

import { basename, extname, join } from 'pathe';
import { escapePath, glob } from 'tinyglobby';

import { LayerscopeError } from '#src/errors.ts';
import type { SymbolTable, SymbolTarget } from '#src/nuxt/symbols.ts';
import { globComponents } from '#src/registry/component-files.ts';
import type { Registry } from '#src/registry/schema.ts';
import type { Layer } from '#src/types.ts';
import { pascalCase } from '#src/utils/strings.ts';

const RERUN_HINT = 'Run "nuxi prepare" again, or pass --prepare.';

// `Button.client.global.vue` is the component `Button`.
const COMPONENT_SUFFIX = /(?:\.(?:client|server))?(?:\.global|\.island)*$/u;

function allTargets(table: SymbolTable): SymbolTarget[] {
  return [
    ...table.components.values(),
    ...Object.values(table.imports).flatMap(map => Array.from(map.values())),
  ];
}

function assertNoDeletedTargets(targets: SymbolTarget[]): void {
  const deleted = targets.find(target => target.file !== null && !existsSync(target.file));
  if (deleted !== undefined && deleted.file !== null) {
    throw new LayerscopeError(
      `Generated types reference ${deleted.file}, which no longer exists. ${RERUN_HINT}`,
    );
  }
}

async function defaultComponentFiles(layers: Layer[]): Promise<string[]> {
  const dirs = layers
    .filter(layer => layer.defaultComponents)
    .map(layer => join(layer.srcDir, 'components'))
    .filter(dir => existsSync(dir));
  if (dirs.length === 0) {
    return [];
  }
  const patterns = dirs.map(dir => join(escapePath(dir), '**/*.vue'));
  // Nuxt leaves island components out of components.d.ts.
  const ignore = dirs.flatMap(dir => [
    join(escapePath(dir), 'islands/**'),
    join(escapePath(dir), '**/*.island.vue'),
  ]);
  return (await glob(patterns, { absolute: true, ignore })).toSorted();
}

/**
 * The `.d.ts` files list only the winner of a layer override, so a file whose name matches a
 * registered component is taken as overridden rather than new.
 */
function isRegisteredName(file: string, names: string[]): boolean {
  const name = pascalCase(basename(file, extname(file)).replace(COMPONENT_SUFFIX, ''));
  return names.some(registered => registered.endsWith(name));
}

/**
 * Stale generated types either point at deleted files or miss new components. File mtimes are
 * not used: Nuxt skips rewriting unchanged templates, so they would report false staleness.
 * Without the registry only the default `components/` dirs are known.
 */
export async function assertFresh(table: SymbolTable, layers: Layer[]): Promise<void> {
  const targets = allTargets(table);
  assertNoDeletedTargets(targets);
  const known = new Set(targets.map(target => target.file));
  const names = [...table.components.keys()];
  const unknown = (await defaultComponentFiles(layers)).find(
    file => !known.has(file) && !isRegisteredName(file, names),
  );
  if (unknown !== undefined) {
    throw new LayerscopeError(`${unknown} is missing from components.d.ts. ${RERUN_HINT}`);
  }
}

/** With the registry, every dir Nuxt scanned (`components:dirs`) is compared, not just the default. */
export async function assertRegistryFresh(table: SymbolTable, registry: Registry): Promise<void> {
  assertNoDeletedTargets(allTargets(table));
  for (const dir of registry.componentDirs) {
    if (dir.path.includes('/node_modules/') || !existsSync(dir.path)) {
      continue;
    }
    const recorded = new Set(dir.files);
    // eslint-disable-next-line no-await-in-loop -- stops at the first stale dir
    const added = (await globComponents(dir.path, dir.pattern, dir.ignore)).find(
      file => !recorded.has(file),
    );
    if (added !== undefined) {
      throw new LayerscopeError(`${added} is missing from the layerscope registry. ${RERUN_HINT}`);
    }
  }
}
