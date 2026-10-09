import type { AliasMap } from '#src/nuxt/aliases.ts';
import type { SymbolMap, SymbolTable } from '#src/nuxt/symbols.ts';
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
  const resolution = resolveSpecifier(ref.specifier, file, env.aliases, env.buildDir);
  if (resolution.kind === 'missing') {
    return [{ resolved: false, message: `Cannot resolve import "${ref.specifier}"` }];
  }
  const target =
    resolution.kind === 'file'
      ? { to: resolution.file, external: resolution.module }
      : { to: null, external: resolution.module };
  return [{ resolved: true, symbol: ref.specifier, target, names: ref.names }];
}
