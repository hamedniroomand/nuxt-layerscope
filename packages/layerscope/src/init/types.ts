import type { Finding } from '#src/types.ts';

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

export interface Proposal {
  edges: AllowedEdge[];
  readiness: Readiness;
  remaining: Finding[];
}
