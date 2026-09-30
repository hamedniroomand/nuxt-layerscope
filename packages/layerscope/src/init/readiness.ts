import { dirname, relative } from 'pathe';

import type { AnalyzeResult } from '#src/types.ts';
import { compareStrings } from '#src/utils/strings.ts';

import type { Cluster, Readiness } from './types.ts';

// ponytail: top 5 only; make it a flag if the long tail matters.
const CLUSTER_LIMIT = 5;

function topClusters(keys: string[]): Cluster[] {
  const counts = new Map<string, number>();
  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .map(([key, count]) => ({ key, count }))
    .toSorted((a, b) => b.count - a.count || compareStrings(a.key, b.key))
    .slice(0, CLUSTER_LIMIT);
}

export function measureReadiness(result: AnalyzeResult): Readiness {
  const unresolved = result.findings.filter(finding => finding.rule === 'unresolved-reference');
  return {
    references: result.edges.length + unresolved.length,
    unresolved: unresolved.length,
    byLayer: topClusters(unresolved.map(finding => finding.fromLayer)),
    byDirectory: topClusters(
      unresolved.map(finding => dirname(relative(result.rootDir, finding.file))),
    ),
  };
}
