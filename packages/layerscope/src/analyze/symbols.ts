import { join } from 'pathe';

import { LayerscopeError } from '#src/errors.ts';
import type { SymbolTable } from '#src/nuxt/symbols.ts';
import { loadSymbolTable } from '#src/nuxt/symbols.ts';
import { readRegistry, tableFromRegistry } from '#src/registry/read.ts';
import type { Registry } from '#src/registry/schema.ts';
import type { ResolutionSource, SourceOption } from '#src/types.ts';

export interface Symbols {
  source: ResolutionSource;
  sourceFile: string;
  /** `null` with the `.d.ts` fallback. */
  registry: Registry | null;
  table: SymbolTable;
  notes: string[];
}

// ponytail: one synchronous block of about 80 ms on large projects; build the table incrementally or in a worker if it shows.
/** The module's registry when present (or required), else the generated `.d.ts` files. */
export function loadSymbols(buildDir: string, source: SourceOption): Symbols {
  const read = source === 'types' ? null : readRegistry(buildDir);
  if (read?.kind === 'ok') {
    const { file, registry } = read;
    const table = tableFromRegistry(registry, buildDir);
    return { source: 'registry', sourceFile: file, registry, table, notes: [] };
  }
  const notes: string[] = [];
  if (read?.kind === 'incompatible') {
    const found = JSON.stringify(read.version);
    const message = `${read.file} has schema version ${found}, which this layerscope does not read.`;
    if (source === 'registry') {
      throw new LayerscopeError(`${message} Update nuxt-layerscope in the project.`);
    }
    notes.push(`${message} Falling back to the generated .d.ts files.`);
  } else if (read !== null && source === 'registry') {
    throw new LayerscopeError(
      `${read.file} not found. Add "nuxt-layerscope" to "modules" in nuxt.config and run "nuxi prepare".`,
    );
  }
  const table = loadSymbolTable(buildDir);
  return { source: 'types', sourceFile: join(buildDir, 'types'), registry: null, table, notes };
}
