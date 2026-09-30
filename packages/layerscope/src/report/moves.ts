import { relative } from 'pathe';

import type { PlannedMove } from '#src/fix/types.ts';
import { plural } from '#src/utils/strings.ts';

function formatMove(move: PlannedMove, cwd: string): string {
  const head = `${relative(cwd, move.from)} → ${relative(cwd, move.to)}  (layer "${move.layer}", clears ${plural(move.fixes, 'finding')})`;
  const updates = move.updates.map(({ file, line, specifier, updated }) => {
    const at = `  ${relative(cwd, file)}:${line}  "${specifier}"`;
    return updated === null ? `${at} — update by hand` : `${at} → "${updated}"`;
  });
  return [head, ...updates].join('\n');
}

export function formatMoves(moves: PlannedMove[], cwd: string): string {
  if (moves.length === 0) {
    return 'No file moves suggested.\n';
  }
  const blocks = moves.map(move => formatMove(move, cwd)).join('\n\n');
  return `${blocks}\n\nNothing was changed (--dry-run). Auto-imports and components need no update.\n`;
}
