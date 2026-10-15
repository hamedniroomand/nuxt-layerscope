import { relative } from 'pathe';

import type { PlannedMove } from '#src/fix/types.ts';
import { plural } from '#src/utils/strings.ts';

export interface MoveNotes {
  /** Findings that no planned move clears. */
  others: number;
  /** `typeImports` is `ignore`, so type-only imports are not in the plan. */
  typeImportsIgnored: boolean;
  /** Baseline entries that name a moved file: they do not match after the move. */
  baselineEntries: number;
}

export const NOT_SCANNED =
  '`check` and `fix` do not check the imports in test files, `nuxt.config.*`, the Nuxt `modules/` dir, files outside the layer source dirs, or files that match `ignore`. Update the imports of moved files in them by hand.';

function formatMove(move: PlannedMove, cwd: string): string {
  const head = `${relative(cwd, move.from)} → ${relative(cwd, move.to)}  (layer "${move.layer}", clears ${plural(move.fixes, 'finding')})`;
  const updates = move.updates.map(({ file, line, column, specifier, updated }) => {
    const at = `  ${relative(cwd, file)}:${line}:${column}  "${specifier}"`;
    return updated === null ? `${at} — update by hand` : `${at} → "${updated}"`;
  });
  return [head, ...updates].join('\n');
}

export function formatOthers(others: number): string[] {
  return others === 0
    ? []
    : [
        `${plural(others, 'other finding')} ${others === 1 ? 'has' : 'have'} no file move. Run \`layerscope check\` to see them.`,
      ];
}

/** `applied` is true after `--apply`, false for `--dry-run`: then the moves are still to be made. */
export function formatBaseline(entries: number, applied: boolean): string[] {
  if (entries === 0) {
    return [];
  }
  const names = `${plural(entries, 'baseline entry', 'baseline entries')} ${entries === 1 ? 'names' : 'name'} a moved file.`;
  const when = applied ? 'After the move' : 'After you make the moves';
  return [
    `${names} ${when}, update ${entries === 1 ? 'this entry' : 'these entries'} in the baseline file, or run \`layerscope check --update-baseline\` if you want to accept all current findings.`,
  ];
}

export function formatMoves(moves: PlannedMove[], cwd: string, notes: MoveNotes): string {
  if (moves.length === 0) {
    return `${['No file moves suggested.', ...formatOthers(notes.others)].join('\n')}\n`;
  }
  const blocks = moves.map(move => formatMove(move, cwd)).join('\n\n');
  const footer = [
    ...formatOthers(notes.others),
    ...formatBaseline(notes.baselineEntries, false),
    'Make the moves with `--apply`, or move the files and update the imports yourself. Then run `layerscope check --prepare`.',
    NOT_SCANNED,
    ...(notes.typeImportsIgnored
      ? ["Type-only imports are not checked (typeImports: 'ignore'), so they are not listed."]
      : []),
  ];
  return `${blocks}\n\n${footer.join('\n')}\n`;
}
