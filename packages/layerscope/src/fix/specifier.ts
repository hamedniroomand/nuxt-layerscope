import { basename, dirname, extname, join, relative } from 'pathe';

import { isExplicitImport } from '#src/suggest/scoped.ts';
import type { Edge } from '#src/types.ts';

const DECLARATION_EXTENSION = /\.d\.[cm]?ts$/u;

function realExtension(file: string): string {
  return DECLARATION_EXTENSION.exec(file)?.[0] ?? extname(file);
}

function stripExtension(path: string): string {
  return path.slice(0, path.length - realExtension(path).length);
}

/**
 * Removes what the user left out of the specifier from the end of the new path. `dropped` is the
 * end of the old file path, such as `.ts`, `.d.ts` or `/index.ts`. When the new path is the file
 * of that dir itself (`index.ts` next to the importer), the dir is `.`.
 */
function dropTail(path: string, dropped: string): string {
  if (path.endsWith(dropped)) {
    return path.slice(0, -dropped.length) || '.';
  }
  if (dropped.startsWith('/') && path === dropped.slice(1)) {
    return '.';
  }
  return path;
}

/**
 * Whether the user wrote an extension when the written path does not start the path of the file
 * (a link, or another case). A name with a dot that starts the file name (`x.module` for
 * `x.module.ts`) or that is the name of its dir (`lib.v2` for `lib.v2/index.ts`) has no extension.
 * The names are compared without case, as the path of the file has its real case.
 */
function hasWrittenExtension(written: string, file: string): boolean {
  const name = basename(written).toLowerCase();
  return (
    extname(written) !== '' &&
    !basename(file).toLowerCase().startsWith(`${name}.`) &&
    basename(dirname(file)).toLowerCase() !== name
  );
}

/**
 * The relative specifier of an import after the importer or the imported file moves. It keeps
 * the style that the user wrote: a dropped extension or `/index` stays dropped, a written
 * extension stays, and a query or hash stays at the end. `null` when the specifier is not relative.
 */
export function newSpecifier(edge: Edge, importer: string, imported: string): string | null {
  if (!edge.symbol.startsWith('.') || edge.to === null) {
    return null;
  }
  const suffix = /[?#]/u.exec(edge.symbol)?.index ?? edge.symbol.length;
  const written = edge.symbol.slice(0, suffix);
  const resolved = join(dirname(edge.file), written);
  let path = relative(dirname(importer), imported);
  if (edge.to !== resolved) {
    if (edge.to.startsWith(resolved)) {
      // The user wrote less than the file path: no extension, or a dir with an index file.
      path = dropTail(path, edge.to.slice(resolved.length));
    } else if (hasWrittenExtension(written, edge.to)) {
      // The user wrote `./foo.js` for `foo.ts`: the written extension stays.
      path = path.slice(0, path.length - realExtension(edge.to).length) + extname(written);
    } else {
      // The file path does not start with the written one (a link, or another case), and the
      // written name has no extension: `./foo`, or a name with a dot such as `./x.module` for
      // `x.module.ts` or `./lib.v2` for `lib.v2/index.ts`.
      const base = basename(path, realExtension(path));
      path =
        base === 'index' && basename(written) !== 'index' ? dirname(path) : stripExtension(path);
    }
  }
  const style = written.endsWith('/') && !path.endsWith('/') ? `${path}/` : path;
  return `${style.startsWith('.') ? style : `./${style}`}${edge.symbol.slice(suffix)}`;
}

/**
 * What a move changes in one import: `undefined` when the import needs no edit, `updated` as the
 * new specifier, or `null` when only the user can fix it. `importer` and `imported` are the paths
 * after the move. Virtual symbols are not text in the source. A relative specifier is rewritten
 * when it changes. An alias is listed only when the file it points at moves; an alias that
 * resolves to the same file after the move stays as it is.
 */
export function importUpdate(
  edge: Edge,
  importer: string,
  imported: string,
): { updated: string | null } | undefined {
  if (!isExplicitImport(edge) || edge.to === null) {
    return undefined;
  }
  if (edge.symbol.startsWith('.')) {
    const updated = newSpecifier(edge, importer, imported);
    return updated === edge.symbol ? undefined : { updated };
  }
  return imported === edge.to ? undefined : { updated: null };
}
