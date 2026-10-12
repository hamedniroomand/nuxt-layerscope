import { relative } from 'pathe';

import type { ApplyResult, Prepared, Step } from '#src/fix/apply.ts';
import { plural } from '#src/utils/strings.ts';

import type { MoveNotes } from './moves.ts';
import { NOT_SCANNED, formatBaseline, formatOthers } from './moves.ts';

function formatStep(step: Step, cwd: string, partial: string | null): string {
  if (step.kind === 'edit' && step.edit.file === partial) {
    return `${relative(cwd, partial)}: the write failed, so the file can be partly written. Check it with \`git diff\`.`;
  }
  return step.kind === 'edit'
    ? `updated ${relative(cwd, step.edit.file)}`
    : `moved ${relative(cwd, step.move.from)} → ${relative(cwd, step.move.to)}`;
}

function listed(files: string[]): string {
  return files.length === 1
    ? `1 file moved without git, so git does not keep its history: ${files[0]}.`
    : `${files.length} files moved without git, so git does not keep their history: ${files.join(', ')}.`;
}

/** What `fix --apply` printed after it made all the steps. */
export function formatApplied(prepared: Prepared, cwd: string, notes: MoveNotes): string {
  const edits = prepared.steps.filter(step => step.kind === 'edit');
  const imports = edits.reduce((sum, step) => sum + step.edit.imports, 0);
  const lines = [
    `Moved ${plural(prepared.moves.length, 'file')}, updated ${plural(imports, 'import')} in ${plural(edits.length, 'file')}.`,
    ...prepared.moves.map(move => `  ${relative(cwd, move.from)} → ${relative(cwd, move.to)}`),
  ];
  if (prepared.byHand.length > 0) {
    lines.push(
      'Update by hand: layerscope does not change imports that use an alias.',
      ...prepared.byHand.map(
        ({ file, line, column, specifier }) =>
          `  ${relative(cwd, file)}:${line}:${column}  "${specifier}"`,
      ),
    );
  }
  const plain = prepared.steps
    .filter(step => step.kind === 'move' && !step.tracked)
    .map(step => (step.kind === 'move' ? relative(cwd, step.move.from) : ''));
  lines.push(
    ...formatOthers(notes.others),
    ...formatBaseline(notes.baselineEntries, true),
    NOT_SCANNED,
    ...(notes.typeImportsIgnored
      ? ["Type-only imports are not checked (typeImports: 'ignore'), so they are not listed."]
      : []),
    ...(plain.length > 0 ? [listed(plain)] : []),
    'Run `layerscope check --prepare` to see what is left.',
  );
  return `${lines.join('\n')}\n`;
}

/** What to tell the user about git after a stop. */
function gitLines(prepared: Prepared): string[] {
  if (!prepared.inGit) {
    return ['The project is not in git, so the lists above are the only record of the changes.'];
  }
  return [
    ...(prepared.allowDirty
      ? [
          'With --allow-dirty, git can show changes from before --apply, and it can miss some changes of --apply. The lists above show what --apply changed.',
        ]
      : []),
    'Run `git status` and `git diff` to see the changes. Use git to undo them.',
  ];
}

/** What `fix --apply` printed when a step failed. */
export function formatStopped(result: ApplyResult, prepared: Prepared, cwd: string): string {
  const list = (steps: Step[]): string[] =>
    steps.map(step => `  ${formatStep(step, cwd, result.partial)}`);
  const lines = [
    `fix --apply stopped: ${result.failure ?? ''}`,
    'Done:',
    ...(result.done.length === 0 ? ['  nothing'] : list(result.done)),
    'Not done:',
    ...list(result.pending),
    ...gitLines(prepared),
  ];
  return `${lines.join('\n')}\n`;
}
