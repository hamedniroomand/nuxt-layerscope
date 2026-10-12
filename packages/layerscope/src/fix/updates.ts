import type { Edge } from '#src/types.ts';

import { importUpdate } from './specifier.ts';
import type { ImportUpdate } from './types.ts';

/**
 * The import edits that a set of moves needs, by the file that moves. `moves` maps each moved
 * file to its new path. An import between two moved files is listed once, with the file it
 * imports. Both the plan that `fix` prints and the count in a suggestion use this one rule.
 */
export function collectUpdates(
  edges: Edge[],
  moves: Map<string, string>,
): Map<string, ImportUpdate[]> {
  const updates = new Map<string, ImportUpdate[]>([...moves.keys()].map(from => [from, []]));
  for (const edge of edges) {
    if (edge.kind !== 'import' || edge.to === null) {
      continue;
    }
    const importerTo = moves.get(edge.file);
    const importedTo = moves.get(edge.to);
    const owner = importedTo === undefined ? edge.file : edge.to;
    const update = importUpdate(edge, importerTo ?? edge.file, importedTo ?? edge.to);
    if (update !== undefined && (importerTo !== undefined || importedTo !== undefined)) {
      updates
        .get(owner)
        ?.push({ file: edge.file, line: edge.line, specifier: edge.symbol, ...update });
    }
  }
  return updates;
}
