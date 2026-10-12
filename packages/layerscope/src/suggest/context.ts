import type { Baseline } from '#src/baseline/index.ts';
import { allowedLayers } from '#src/config/allow.ts';
import { isAllowed } from '#src/rules/layer-boundary.ts';
import type { Edge, Finding, Layer, LayerscopeConfig } from '#src/types.ts';

import type { LayerNames } from './names.ts';

/** Lookups for suggestions, indexed once so each finding costs no scan of every edge. */
export interface Context {
  rootDir: string;
  config: LayerscopeConfig;
  layers: Layer[];
  /** Every edge of the project. */
  edges: Edge[];
  /** Cross-layer dependencies seen in the code, by layer. */
  seen: Map<string, Set<string>>;
  /** Edges by the file they resolve to. */
  usesOf: Map<string, Edge[]>;
  /** The edge behind a finding, by position and symbol. */
  edgeAt: Map<string, Edge>;
  /** Edges by the file they start in. */
  edgesFrom: Map<string, Edge[]>;
  /**
   * Boundary and internal findings that a move of the file removes: the ones that resolve to it,
   * and the ones in it, as the file then uses from another layer. A finding counts once.
   */
  findingsAt: Map<string, number>;
  /** Destinations that a move has taken, with the file that moves there. */
  claimed: Map<string, string>;
  /** What the baseline accepts, as `check` reads it; `null` without a baseline. */
  baseline: Baseline | null;
  /** The chains of the cycles that `check` shows now; read once, as they do not change. */
  cycles: Set<string> | null;
  /** Files that get no move, because the plan as a whole would break `check`. */
  blocked: Set<string>;
  /** The names that each layer has in the dirs that Nuxt scans, read once. */
  names: Map<string, LayerNames>;
  /** Findings by `from\0to` layer pair. */
  findingsFor: Map<string, number>;
  /** Boundary findings by layer pair, to see which names a scoped entry would list. */
  boundaryBy: Map<string, Finding[]>;
  /** Internal findings by `to\0symbol`. */
  internalBy: Map<string, Finding[]>;
  /** Layers whose `allow` the preset gave, because the config gave them none. */
  presetLayers: Set<string>;
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

function clearedByMove(findings: Finding[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    if (finding.rule === 'layer-boundary' || finding.rule === 'layer-internal') {
      const files = new Set(
        finding.target === null ? [finding.file] : [finding.file, finding.target],
      );
      for (const file of files) {
        counts.set(file, (counts.get(file) ?? 0) + 1);
      }
    }
  }
  return counts;
}

function edgeKey(edge: { file: string; line: number; column: number; symbol: string }): string {
  return `${edge.file}\0${edge.line}\0${edge.column}\0${edge.symbol}`;
}

/** The edge that a finding was made from. */
export function edgeOfFinding(context: Context, finding: Finding): Edge | undefined {
  return context.edgeAt.get(edgeKey(finding));
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
  presetLayers: string[] = [],
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
    edges,
    presetLayers: new Set(presetLayers),
    seen,
    usesOf: group(edges, edge => edge.to),
    edgesFrom: group(edges, edge => edge.file),
    edgeAt: new Map(edges.map(edge => [edgeKey(edge), edge])),
    claimed: new Map(),
    baseline: null,
    cycles: null,
    blocked: new Set(),
    names: new Map(),
    findingsAt: clearedByMove(findings),
    findingsFor: count(findings, finding =>
      finding.toLayer === null ? null : pairKey(finding.fromLayer, finding.toLayer),
    ),
    boundaryBy: group(findings, finding =>
      finding.rule === 'layer-boundary' && finding.toLayer !== null
        ? pairKey(finding.fromLayer, finding.toLayer)
        : null,
    ),
    internalBy: group(findings, finding =>
      finding.rule === 'layer-internal' && finding.toLayer !== null
        ? pairKey(finding.toLayer, finding.symbol)
        : null,
    ),
  };
}

/** A local layer is a dir inside the project root that is not in `node_modules`. */
export function isLocal(layer: Layer, rootDir: string): boolean {
  return layer.root.startsWith(`${rootDir}/`) && !layer.root.includes('/node_modules/');
}

/**
 * A layer that a file may move to: a local layer, or the root layer. The root layer is the
 * project root itself, so it is not local. Files of the root layer do not move out of it.
 */
export function isMoveTarget(layer: Layer, rootDir: string): boolean {
  return layer.root === rootDir || isLocal(layer, rootDir);
}

/** Whether the layer of the edge may use what the edge points at, scoped entries included. */
export function permits(context: Context, edge: Edge): boolean {
  const allow = context.config.layers?.[edge.fromLayer]?.allow;
  return allow === undefined || isAllowed(edge, allow, context.layers);
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
        ...allowedLayers(context.config.layers?.[layer]?.allow ?? []),
      );
    }
  }
  return false;
}
