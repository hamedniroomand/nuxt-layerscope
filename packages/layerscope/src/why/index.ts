import type { EdgeStatus } from '#src/rules/edge-status.ts';
import { edgeStatus } from '#src/rules/edge-status.ts';
import type { AnalyzeResult, Edge, LayerscopeConfig } from '#src/types.ts';
import { pascalCase } from '#src/utils/strings.ts';

export type UseStatus = EdgeStatus;

export interface SymbolUse {
  edge: Edge;
  status: UseStatus;
}

/** Uses grouped by what the symbol resolves to. */
export interface SymbolTarget {
  symbol: string;
  /** File in a layer, or `null` for packages and virtual modules. */
  file: string | null;
  layer: string | null;
  external: string | null;
  uses: SymbolUse[];
}

/** `LazyBaseButton` and `base-button` both name `BaseButton`. */
function componentName(name: string): string {
  const pascal = pascalCase(name);
  return /^Lazy[A-Z]/u.test(pascal) ? pascal.slice('Lazy'.length) : pascal;
}

/** The name an edge is known by: `#imports:useCart` is `useCart`. */
function edgeName(edge: Edge): string {
  const match = /^#(?:imports|components):(.+)$/u.exec(edge.symbol);
  return match === null ? edge.symbol : match[1];
}

function matches(edge: Edge, query: string): boolean {
  if (edge.symbol === query) {
    return true;
  }
  const name = edgeName(edge);
  if (name === query) {
    return true;
  }
  const isComponent = edge.kind === 'component' || edge.symbol.startsWith('#components:');
  return isComponent && componentName(name) === componentName(query);
}

/** Every use of a symbol (auto-import, component or import specifier), in report order. */
export function findUses(
  result: AnalyzeResult,
  query: string,
  config: LayerscopeConfig,
): SymbolTarget[] {
  const targets = new Map<string, SymbolTarget>();
  for (const edge of result.edges.filter(candidate => matches(candidate, query))) {
    const key = edge.to ?? `external:${edge.external}`;
    let target = targets.get(key);
    if (target === undefined) {
      target = {
        symbol: edge.kind === 'component' ? componentName(query) : query,
        file: edge.to,
        layer: edge.toLayer,
        external: edge.external,
        uses: [],
      };
      targets.set(key, target);
    }
    target.uses.push({ edge, status: edgeStatus(edge, config) });
  }
  return [...targets.values()];
}
