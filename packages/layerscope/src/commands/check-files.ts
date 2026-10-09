import { existsSync, statSync } from 'node:fs';

import { resolve } from 'pathe';

import { LayerscopeError } from '#src/errors.ts';
import { changedFiles, pathSelection, stagedFiles } from '#src/git/selection.ts';
import type { Selection } from '#src/git/selection.ts';
import { plural } from '#src/utils/strings.ts';

/** The note about deleted files in a selection, or `null` when none was deleted. */
export function deletedNote(selection: Selection): string | null {
  return selection.deleted === 0
    ? null
    : `${plural(selection.deleted, 'deleted source file')}: files that used their symbols are not checked.`;
}

export interface FileFlags {
  staged?: boolean;
  changed?: boolean;
  since?: string;
  watch?: boolean;
  updateBaseline?: boolean;
}

export interface CheckTarget {
  rootDir: string;
  /** `undefined` for a check of the whole project. */
  selection: Selection | undefined;
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/**
 * `check [root] [files...]`. A first argument that is a directory is the root, as before; so is a
 * single argument that does not exist, which keeps the error for a mistyped root. Otherwise every
 * argument is a file and the root is the working directory, which is what `lint-staged` passes.
 */
export function splitArguments(
  root: string | undefined,
  files: string[],
): {
  root: string | undefined;
  files: string[];
} {
  const all = root === undefined ? files : [root, ...files];
  const first = all.at(0);
  if (first === undefined) {
    return { root: undefined, files: [] };
  }
  if (isDirectory(resolve(first)) || (all.length === 1 && !existsSync(resolve(first)))) {
    return { root: first, files: all.slice(1) };
  }
  return { root: undefined, files: all };
}

function assertNoConflict(flags: FileFlags, files: string[]): void {
  const changed = flags.changed === true || flags.since !== undefined;
  const modes = [flags.staged === true, changed, files.length > 0].filter(Boolean).length;
  if (modes > 1) {
    throw new LayerscopeError('Use one of --staged, --changed (or --since) and file arguments.');
  }
  if (modes === 1 && flags.updateBaseline === true) {
    throw new LayerscopeError(
      'A check of some files cannot write the baseline: it would drop the other entries. Leave out --staged, --changed and the files.',
    );
  }
  if (modes === 1 && flags.watch === true) {
    throw new LayerscopeError(
      '--watch checks every file; leave out --staged, --changed and the files.',
    );
  }
}

/** Which files to check, from the flags and the arguments. */
export function selectTarget(
  root: string | undefined,
  files: string[],
  flags: FileFlags,
): CheckTarget {
  const split = splitArguments(root, files);
  assertNoConflict(flags, split.files);
  const rootDir = resolve(split.root ?? process.cwd());
  if (flags.staged === true) {
    return { rootDir, selection: stagedFiles(rootDir) };
  }
  if (flags.changed === true || flags.since !== undefined) {
    return { rootDir, selection: changedFiles(rootDir, flags.since) };
  }
  return {
    rootDir,
    selection: split.files.length > 0 ? pathSelection(split.files) : undefined,
  };
}
