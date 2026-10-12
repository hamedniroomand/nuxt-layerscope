import type { AnalyzeResult } from '#src/types.ts';

import type { PlannedMove } from './types.ts';
import { collectUpdates } from './updates.ts';

export function planMoves(result: AnalyzeResult): PlannedMove[] {
  const moves = new Map<string, PlannedMove>();
  for (const { target, suggestion } of result.findings) {
    if (target !== null && suggestion?.action === 'move' && suggestion.file !== undefined) {
      moves.set(target, {
        from: target,
        to: suggestion.file,
        layer: suggestion.layer ?? '',
        fixes: suggestion.impact.fixes,
        updates: [],
      });
    }
  }
  const updates = collectUpdates(
    result.edges,
    new Map([...moves.values()].map(move => [move.from, move.to])),
  );
  for (const move of moves.values()) {
    move.updates = updates.get(move.from) ?? [];
  }
  return [...moves.values()];
}

/**
 * The findings that no planned move clears, of every rule. A move of a file clears each boundary
 * and internal finding that points at it and each one in it, whatever suggestion that finding has.
 */
export function countOtherFindings(result: AnalyzeResult, moves: PlannedMove[]): number {
  const moved = new Set(moves.map(move => move.from));
  return result.findings.filter(
    finding =>
      !(
        (finding.rule === 'layer-boundary' || finding.rule === 'layer-internal') &&
        (moved.has(finding.file) || (finding.target !== null && moved.has(finding.target)))
      ),
  ).length;
}
