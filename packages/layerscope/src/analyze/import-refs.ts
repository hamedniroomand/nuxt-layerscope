import type { AliasMap } from '#src/nuxt/aliases.ts';
import type { SymbolMap, SymbolTable, SymbolTarget } from '#src/nuxt/symbols.ts';
import type { LayerPackages } from '#src/resolve/layer-package.ts';
import { resolveSpecifier } from '#src/resolve/specifier.ts';
import type { ImportRef } from '#src/scan/types.ts';
import type { Context } from '#src/types.ts';

export interface ImportTarget {
  to: string | null;
  /** Package or virtual module, used when no layer owns `to`. */
  external: string | null;
}

export type ImportOutcome =
  | { resolved: true; symbol: string; target: ImportTarget; names?: string[] }
  | { resolved: false; message: string };

export interface ImportEnv {
  table: SymbolTable;
  aliases: AliasMap;
  buildDir: string;
  /** The package names of the layers, so an import by one of them resolves to a file. */
  layerPackages: LayerPackages;
}

function virtualModule(specifier: string, context: Context, table: SymbolTable): SymbolMap | null {
  if (specifier === '#imports') {
    return table.imports[context];
  }
  return specifier === '#components' ? table.components : null;
}

/** `#imports` and `#components` are resolved by name through the symbol table. */
export function resolveImportRef(
  ref: ImportRef,
  file: string,
  context: Context,
  env: ImportEnv,
): ImportOutcome[] {
  const virtual = virtualModule(ref.specifier, context, env.table);
  if (virtual !== null) {
    return ref.names.map(name => {
      const target = virtual.get(name);
      return target === undefined
        ? { resolved: false, message: `"${name}" is not exported by ${ref.specifier}` }
        : {
            resolved: true,
            symbol: `${ref.specifier}:${name}`,
            target: { to: target.file, external: target.module },
          };
    });
  }
  const resolution = resolveSpecifier(
    ref.specifier,
    file,
    env.aliases,
    env.buildDir,
    env.layerPackages,
    { require: ref.require, typeStatement: ref.typeStatement, server: context === 'server' },
  );
  if (resolution.kind === 'missing') {
    return [{ resolved: false, message: `Cannot resolve import "${ref.specifier}"` }];
  }
  const target =
    resolution.kind === 'file'
      ? { to: resolution.file, external: resolution.module }
      : { to: null, external: resolution.module };
  return [{ resolved: true, symbol: ref.specifier, target, names: ref.names }];
}

/** The auto-imports that a name stands for in these contexts: one for each different target. */
export function lookupAutoImports(
  table: SymbolTable,
  contexts: Context[],
  name: string,
): SymbolTarget[] {
  const found = new Map<string, SymbolTarget>();
  for (const context of contexts) {
    const target = table.imports[context].get(name);
    if (target !== undefined) {
      found.set(`${target.file}\0${target.module}`, target);
    }
  }
  return [...found.values()];
}

const VIRTUAL_MODULES = new Set(['#imports', '#components']);

/**
 * What an import stands for. A virtual module (`#imports`, `#components`) is looked up in each
 * context of the file, so an extra file that imports a server name gets it; the same target is
 * kept once. A path is resolved once, in the first context: the file's own context.
 */
export function outcomesOf(
  ref: ImportRef,
  file: string,
  contexts: Context[],
  env: ImportEnv,
): ImportOutcome[] {
  const found = new Map<string, ImportOutcome>();
  for (const context of VIRTUAL_MODULES.has(ref.specifier) ? contexts : contexts.slice(0, 1)) {
    for (const outcome of resolveImportRef(ref, file, context, env)) {
      const key = outcome.resolved
        ? `${outcome.symbol}\0${outcome.target.to}\0${outcome.target.external}`
        : `\0${outcome.message}`;
      if (!found.has(key)) {
        found.set(key, outcome);
      }
    }
  }
  return [...found.values()];
}

/**
 * A type-only statement, or for a virtual module such as `#imports` (one outcome for each name,
 * in the symbol as `#imports:Name`) a name that only a `type` keyword brings in.
 */
export function isIgnored(ref: ImportRef, symbol: string): boolean {
  return ref.typeOnly || ref.typeNames.some(name => symbol === `${ref.specifier}:${name}`);
}
