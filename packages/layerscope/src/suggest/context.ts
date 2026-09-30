import type { Edge, Finding, Layer, LayerscopeConfig } from '#src/types.ts';

export interface Context {
  rootDir: string;
  config: LayerscopeConfig;
  layers: Layer[];
  edges: Edge[];
  findings: Finding[];
  /** Cross-layer dependencies seen in the code, by layer. */
  seen: Map<string, Set<string>>;
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
  return { rootDir, config, layers, edges, findings, seen };
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
