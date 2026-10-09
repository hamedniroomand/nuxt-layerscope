import type { Finding, PresetName } from '#src/types.ts';

export interface AllowedEdge {
  from: string;
  to: string;
  count: number;
  /** First reference as `file:line`, relative to the root. */
  example: string;
}

export interface Cluster {
  key: string;
  count: number;
}

export interface Readiness {
  references: number;
  unresolved: number;
  byLayer: Cluster[];
  byDirectory: Cluster[];
}

/** A preset that allows every dependency that exists today. */
export interface PresetFit {
  name: PresetName;
  /** The base layers that it picked, lowest first. */
  base: string[];
}

export interface Proposal {
  edges: AllowedEdge[];
  /** The strictest preset that fits, or `null` when none does. */
  preset: PresetFit | null;
  readiness: Readiness;
  remaining: Finding[];
}
