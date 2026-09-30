import { compareStrings } from '#src/utils/strings.ts';

function pathTo(layer: string, start: string, parent: Map<string, string>): string[] {
  const path: string[] = [];
  for (let current = layer; current !== start; current = parent.get(current) ?? start) {
    path.unshift(current);
  }
  return path;
}

/** The shortest chain `start → … → start` through layers that sort after `start`. */
export function shortestCycle(start: string, adjacency: Map<string, string[]>): string[] | null {
  const parent = new Map<string, string>();
  const queue = [start];
  for (const layer of queue) {
    for (const next of adjacency.get(layer) ?? []) {
      if (next === start) {
        return [start, ...pathTo(layer, start, parent), start];
      }
      if (compareStrings(next, start) > 0 && !parent.has(next)) {
        parent.set(next, layer);
        queue.push(next);
      }
    }
  }
  return null;
}
