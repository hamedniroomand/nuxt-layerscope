import { relative } from 'pathe';

import type { AnalyzeResult } from '#src/types.ts';
import { compareStrings } from '#src/utils/strings.ts';

import type { AllowedEdge } from './types.ts';

export function collectEdges(result: AnalyzeResult): AllowedEdge[] {
  const edges = new Map<string, AllowedEdge>();
  for (const { file, line, fromLayer, toLayer } of result.edges) {
    if (toLayer === null || toLayer === fromLayer) {
      continue;
    }
    const key = `${fromLayer}\0${toLayer}`;
    const edge = edges.get(key);
    if (edge === undefined) {
      const example = `${relative(result.rootDir, file)}:${line}`;
      edges.set(key, { from: fromLayer, to: toLayer, count: 1, example });
    } else {
      edge.count += 1;
    }
  }
  return [...edges.values()].toSorted(
    (a, b) => compareStrings(a.from, b.from) || compareStrings(a.to, b.to),
  );
}
