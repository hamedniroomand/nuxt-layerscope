import type { SymbolTable } from '#src/nuxt/symbols.ts';
import type { FileScan } from '#src/scan/types.ts';
import type { Context } from '#src/types.ts';

import type { ImportTarget } from './import-refs.ts';
import { edgeTarget } from './import-refs.ts';

export interface PageNameUse {
  kind: 'layout' | 'middleware';
  name: string;
  offset: number;
  target: ImportTarget;
}

/**
 * The uses of a layout or a route middleware by its name, each with the file that Nuxt uses for
 * the name. A name that Nuxt does not know gives nothing: a page can name a middleware that a
 * plugin adds with `addRouteMiddleware()`. Without the registry, the table has no files for these
 * names. These names work only in the app, so a file of the server gives nothing.
 */
export function pageNameUses(scan: FileScan, table: SymbolTable, context: Context): PageNameUse[] {
  if (context === 'server') {
    return [];
  }
  const uses: PageNameUse[] = [];
  for (const [kind, refs, files] of [
    ['layout', scan.layouts, table.layouts],
    ['middleware', scan.middleware, table.middleware],
  ] as const) {
    for (const { name, offset } of refs) {
      const target = files?.get(name);
      if (target !== undefined) {
        uses.push({ kind, name, offset, target: edgeTarget(target) });
      }
    }
  }
  return uses;
}
