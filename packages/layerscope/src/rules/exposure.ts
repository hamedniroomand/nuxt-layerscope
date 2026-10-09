import { relative } from 'pathe';

import type { Edge } from '#src/types.ts';
import { matchesGlob } from '#src/utils/glob.ts';
import { pascalCase } from '#src/utils/strings.ts';

/** A name is an identifier; everything else in an `expose` or `only` list is a path glob. */
const NAME = /^[A-Za-z_$][\w$-]*$/u;

/** `#imports:useCart` and `#components:BaseButton`: a name, not a specifier. */
const VIRTUAL = /^#(?:imports|components):/u;

/** `LazyBaseButton` and `base-button` both name `BaseButton`. */
export function componentName(name: string): string {
  const pascal = pascalCase(name);
  return /^Lazy[A-Z]/u.test(pascal) ? pascal.slice('Lazy'.length) : pascal;
}

/** The name an edge is known by: `#imports:useCart` is `useCart`. */
export function edgeName(edge: Edge): string {
  const match = /^#(?:imports|components):(.+)$/u.exec(edge.symbol);
  return match === null ? edge.symbol : match[1];
}

function baseName(file: string): string {
  const name = file.slice(file.lastIndexOf('/') + 1);
  const dot = name.indexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * The names a use is checked by. An auto-import and a component have one. An explicit import has
 * the names it imports; a default or namespace import, or one with no known name, has the base
 * name of the file, as Nuxt names a composable.
 */
function namesOf(edge: Edge): string[] {
  const isComponent = edge.kind === 'component' || edge.symbol.startsWith('#components:');
  if (isComponent) {
    return [componentName(edgeName(edge))];
  }
  if (edge.kind === 'import' && !VIRTUAL.test(edge.symbol)) {
    const all = edge.names ?? [];
    const named = all.filter(name => name !== 'default' && name !== '*');
    const needsFile = named.length < all.length || all.length === 0;
    return needsFile && edge.to !== null ? [...named, baseName(edge.to)] : named;
  }
  return [edgeName(edge)];
}

function nameMatches(entry: string, name: string, edge: Edge): boolean {
  const isComponent = edge.kind === 'component' || edge.symbol.startsWith('#components:');
  return isComponent ? componentName(entry) === name : entry === name;
}

/**
 * Whether `entries` (`expose` or `only`) cover a use: the target file matches a glob, or every
 * name of the use is listed. `layerRoot` is the root of the layer the target is in.
 */
export function coversEdge(entries: string[], edge: Edge, layerRoot?: string): boolean {
  const names = entries.filter(entry => NAME.test(entry));
  const globs = entries.filter(entry => !NAME.test(entry));
  if (edge.to !== null && layerRoot !== undefined) {
    const path = relative(layerRoot, edge.to);
    if (globs.some(glob => matchesGlob(glob, path))) {
      return true;
    }
  }
  const used = namesOf(edge);
  return used.length > 0 && used.every(name => names.some(entry => nameMatches(entry, name, edge)));
}
