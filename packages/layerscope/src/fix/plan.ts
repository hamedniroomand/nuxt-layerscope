import type { AnalyzeResult } from '#src/types.ts';

import { newSpecifier } from './specifier.ts';
import type { PlannedMove } from './types.ts';

function collectMoves(result: AnalyzeResult): Map<string, PlannedMove> {
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
  return moves;
}

export function planMoves(result: AnalyzeResult): PlannedMove[] {
  const moves = collectMoves(result);
  for (const edge of result.edges) {
    if (edge.kind !== 'import' || edge.to === null) {
      continue;
    }
    const importerMove = moves.get(edge.file);
    const importedMove = moves.get(edge.to);
    const move = importedMove ?? importerMove;
    if (move === undefined) {
      continue;
    }
    const updated = newSpecifier(edge, importerMove?.to ?? edge.file, importedMove?.to ?? edge.to);
    if (updated !== edge.symbol) {
      move.updates.push({ file: edge.file, line: edge.line, specifier: edge.symbol, updated });
    }
  }
  return [...moves.values()];
}
