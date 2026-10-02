import type { Edge, Finding, Layer, LayerscopeConfig } from '#src/types.ts';

/** Lookups for suggestions, indexed once so each finding costs no scan of every edge. */
export interface Context {
  rootDir: string;
  config: LayerscopeConfig;
  layers: Layer[];
  /** Cross-layer dependencies seen in the code, by layer. */
  seen: Map<string, Set<string>>;
  /** Edges by the file they resolve to. */
  usesOf: Map<string, Edge[]>;
  /** Edges by the file they start in. */
  edgesFrom: Map<string, Edge[]>;
  /** Findings by the file they resolve to. */
  findingsAt: Map<string, number>;
  /** Findings by `from\0to` layer pair. */
  findingsFor: Map<string, number>;
}

function group<T>(items: T[], keyOf: (item: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key !== null) {
      const list = groups.get(key);
      if (list === undefined) {
        groups.set(key, [item]);
      } else {
        list.push(item);
      }
    }
  }
  return groups;
}

function count<T>(items: T[], keyOf: (item: T) => string | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    if (key !== null) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

export function pairKey(from: string, to: string): string {
  return `${from}\0${to}`;
}

export function createContext(
  findings: Finding[],
  edges: Edge[],
  layers: Layer[],
  config: LayerscopeConfig,
  rootDir: string,
): Context {
  const seen = new Map<string, Set<string>>();
  for (const { fromLayer, toLayer } of edges) {
    if (toLayer !== null && toLayer !== fromLayer) {
      seen.set(fromLayer, (seen.get(fromLayer) ?? new Set()).add(toLayer));
    }
  }
  return {
    rootDir,
    config,
    layers,
    seen,
    usesOf: group(edges, edge => edge.to),
    edgesFrom: group(edges, edge => edge.file),
    findingsAt: count(findings, finding => finding.target),
    findingsFor: count(findings, finding =>
      finding.toLayer === null ? null : pairKey(finding.fromLayer, finding.toLayer),
    ),
  };
}

export function isLocal(layer: Layer, rootDir: string): boolean {
  return layer.root.startsWith(`${rootDir}/`) && !layer.root.includes('/node_modules/');
}

export function mayUse({ config }: Context, from: string, to: string): boolean {
  const allow = config.layers?.[from]?.allow;
  return from === to || allow === undefined || allow.includes(to);
}

// ponytail: follows seen and configured edges only, not the ones a suggestion would add.
export function reaches(context: Context, from: string, to: string): boolean {
  const visited = new Set<string>();
  const stack = [from];
  for (let layer = stack.pop(); layer !== undefined; layer = stack.pop()) {
    if (layer === to) {
      return true;
    }
    if (!visited.has(layer)) {
      visited.add(layer);
      stack.push(
        ...(context.seen.get(layer) ?? []),
        ...(context.config.layers?.[layer]?.allow ?? []),
      );
    }
  }
  return false;
}
