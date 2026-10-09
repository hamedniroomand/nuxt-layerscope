import { componentName, edgeName } from '#src/rules/exposure.ts';
import type { Edge } from '#src/types.ts';
import { compareStrings } from '#src/utils/strings.ts';

/** More names than this are a sign that the whole layer is meant. */
export const MAX_ONLY = 3;

const VIRTUAL = /^#(?:imports|components):/u;

/** An explicit import of a file: the names are the ones the statement imports. */
export function isExplicitImport(edge: Edge): boolean {
  return edge.kind === 'import' && !VIRTUAL.test(edge.symbol);
}

/**
 * The names a use stands for in an `only` or `expose` list, or `null` when a list of names does
 * not fit: an explicit import with a default, a namespace or no named import needs a glob.
 */
export function namesOfEdge(edge: Edge): string[] | null {
  if (isExplicitImport(edge)) {
    const all = edge.names ?? [];
    const named = all.filter(name => name !== 'default' && name !== '*');
    return named.length > 0 && named.length === all.length ? named : null;
  }
  const name = edgeName(edge);
  return [
    edge.kind === 'component' || edge.symbol.startsWith('#components:')
      ? componentName(name)
      : name,
  ];
}

/**
 * The names behind the uses of one layer pair, when there are few and every use has names.
 * `null` means a scoped entry does not fit: use the whole layer.
 */
export function onlyNames(edges: Edge[]): string[] | null {
  const names = new Set<string>();
  for (const edge of edges) {
    const own = namesOfEdge(edge);
    if (own === null) {
      return null;
    }
    for (const name of own) {
      names.add(name);
    }
  }
  return names.size > 0 && names.size <= MAX_ONLY ? [...names].toSorted(compareStrings) : null;
}
