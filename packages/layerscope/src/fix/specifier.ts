import { basename, dirname, extname, relative } from 'pathe';

import type { Edge } from '#src/types.ts';

// ponytail: only relative specifiers are rewritten; aliases such as `~/` or `#layers/` are listed.
export function newSpecifier(edge: Edge, importer: string, imported: string): string | null {
  if (!edge.symbol.startsWith('.') || edge.to === null) {
    return null;
  }
  const extension = extname(edge.to);
  let path = relative(dirname(importer), imported);
  if (!edge.symbol.endsWith(extension)) {
    path = path.slice(0, -extension.length);
    if (basename(path) === 'index' && !edge.symbol.endsWith('index')) {
      path = dirname(path);
    }
  }
  return path.startsWith('.') ? path : `./${path}`;
}
