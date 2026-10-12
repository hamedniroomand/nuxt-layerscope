import { relative } from 'pathe';

import type { PlannedMove } from '#src/fix/types.ts';
import { plural } from '#src/utils/strings.ts';

export interface MoveNotes {
  /** Findings that have a suggestion other than a move. */
  others: number;
  /** `typeImports` is `ignore`, so type-only imports are not in the plan. */
  typeImportsIgnored: boolean;
}

function formatMove(move: PlannedMove, cwd: string): string {
  const head = `${relative(cwd, move.from)} → ${relative(cwd, move.to)}  (layer "${move.layer}", clears ${plural(move.fixes, 'finding')})`;
  const updates = move.updates.map(({ file, line, specifier, updated }) => {
    const at = `  ${relative(cwd, file)}:${line}  "${specifier}"`;
    return updated === null ? `${at} — update by hand` : `${at} → "${updated}"`;
  });
  return [head, ...updates].join('\n');
}

function formatOthers(others: number): string[] {
  return others === 0
    ? []
    : [
        `${plural(others, 'other finding')} ${others === 1 ? 'has' : 'have'} no file move. Run \`layerscope check\` to see their suggestions.`,
      ];
}

export function formatMoves(moves: PlannedMove[], cwd: string, notes: MoveNotes): string {
  if (moves.length === 0) {
    return `${['No file moves suggested.', ...formatOthers(notes.others)].join('\n')}\n`;
  }
  const blocks = moves.map(move => formatMove(move, cwd)).join('\n\n');
  const footer = [
    ...formatOthers(notes.others),
    'Move the files, update the imports, then run `layerscope check --prepare`.',
    'layerscope does not scan test files, `nuxt.config.*`, `modules/`, files outside the layer source dirs, or files that match `ignore`. Update the imports of moved files in them by hand.',
    ...(notes.typeImportsIgnored
      ? ["Type-only imports are not checked (typeImports: 'ignore'), so they are not listed."]
      : []),
  ];
  return `${blocks}\n\n${footer.join('\n')}\n`;
}
