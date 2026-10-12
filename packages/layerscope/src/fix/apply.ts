import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

import { dirname, relative } from 'pathe';

import { LayerscopeError } from '#src/errors.ts';
import { git } from '#src/utils/git.ts';

import { caseRefusals, moveRefusals, pathRefusals } from './checks.ts';
import type { Edit } from './edits.ts';
import { message, prepareEdits } from './edits.ts';
import type { GitState } from './git-state.ts';
import {
  gitMoveProblem,
  gitRefusals,
  has,
  inSameRepository,
  inSubmodule,
  readState,
  targetProblem,
  trackingRefusals,
} from './git-state.ts';
import { exists } from './paths.ts';
import type { ImportUpdate, PlannedMove } from './types.ts';

export type Step =
  | { kind: 'edit'; edit: Edit }
  | { kind: 'move'; move: PlannedMove; tracked: boolean };

export interface Prepared {
  moves: PlannedMove[];
  steps: Step[];
  /** Imports with an alias: layerscope does not write them. */
  byHand: ImportUpdate[];
  /** The root is in a git repository. */
  inGit: boolean;
  /** `--allow-dirty` was given: git can show changes from before, and it can miss some. */
  allowDirty: boolean;
}

/** The writes of `runApply`. A test can replace them to make one fail. */
export interface ApplyIo {
  read: (file: string) => string;
  mkdir: (dir: string) => void;
  write: (file: string, text: string) => void;
  /** `tracked` is true when git tracks the file: then `git mv` keeps its history. */
  move: (from: string, to: string, tracked: boolean) => void;
}

export interface ApplyResult {
  done: Step[];
  pending: Step[];
  /** The message of the first failure; `null` when all steps are done. */
  failure: string | null;
  /** The file whose write failed: it can be partly written. */
  partial: string | null;
}

export function realIo(rootDir: string): ApplyIo {
  return {
    read: file => readFileSync(file, 'utf8'),
    mkdir: dir => {
      mkdirSync(dir, { recursive: true });
    },
    write: (file, text) => {
      writeFileSync(file, text);
    },
    move: (from, to, tracked) => {
      // A move never overwrites: a file can have appeared after the checks.
      if (exists(to)) {
        throw new Error(`${to} exists`);
      }
      if (tracked) {
        git(rootDir, 'mv', '--', from, to);
      } else {
        renameSync(from, to);
      }
    },
  };
}

function gitErrors(state: GitState, rootDir: string, cwd: string): string[] {
  return state.error === null ? [] : gitRefusals(state, rootDir, cwd);
}

/**
 * The moves that `git mv` does: git tracks the file, and the target is in the work tree. Git
 * refuses some of them after the edits (a target outside a sparse checkout), so ask it now with
 * `git mv -n`. A move that git refuses is a refusal, or a plain rename with `--allow-dirty`.
 */
function planGitMoves(
  state: GitState,
  rootDir: string,
  moves: PlannedMove[],
  options: { allowDirty: boolean; cwd: string },
): { usesGit: Set<PlannedMove>; refusals: string[] } {
  const usesGit = new Set<PlannedMove>();
  const refusals: string[] = [];
  const name = (path: string): string => relative(options.cwd, path);
  for (const move of moves) {
    const top = state.top;
    const inRepo =
      top !== null &&
      has(state.tracked, move.from) &&
      targetProblem(state, move.to) === null &&
      !inSubmodule(state, move.from);
    if (top === null || !inRepo) {
      continue;
    }
    if (!inSameRepository(move.to, top)) {
      if (!options.allowDirty) {
        refusals.push(
          `${name(move.to)} is in another git repository, so \`git status\` of this repository would not show the move. Use --allow-dirty to do it anyway.`,
        );
      }
      continue;
    }
    const problem = gitMoveProblem(rootDir, move.from, move.to);
    if (problem === null) {
      usesGit.add(move);
    } else if (!problem.sparse) {
      // Another error of git, such as a lock: a plain rename would hide it, so it stops here.
      refusals.push(`git does not move ${name(move.from)} to ${name(move.to)}: ${problem.line}`);
    } else if (!options.allowDirty) {
      refusals.push(
        `git does not move ${name(move.from)} to ${name(move.to)}: ${problem.line} Use --allow-dirty to do it with a plain rename.`,
      );
    }
  }
  return { usesGit, refusals };
}

/**
 * Checks everything before the first write, and collects all the reasons to refuse. Throws one
 * `LayerscopeError` with all of them, so that nothing is changed. `moves` is the plan that
 * `fix --dry-run` prints. Without `allowDirty`, `git status` and `git diff` must show each change.
 */
export function prepareApply(
  moves: PlannedMove[],
  rootDir: string,
  options: { allowDirty: boolean; cwd: string },
): Prepared {
  const { cwd } = options;
  const state = readState(rootDir);
  const refusals: string[] = [];
  const { edits, byHand, files } = prepareEdits(
    moves.flatMap(move => move.updates),
    cwd,
    refusals,
  );
  const changed = new Set([...moves.map(move => move.from), ...files]);
  const targets = moves.map(move => move.to);
  // `--allow-dirty` passes "no repository", but not an error of git: it could be a repository.
  const gitReasons = options.allowDirty
    ? gitErrors(state, rootDir, cwd)
    : [
        ...gitRefusals(state, rootDir, cwd),
        ...(state.top === null ? [] : trackingRefusals(state, changed, targets, cwd)),
      ];
  const { usesGit, refusals: gitMoves } = planGitMoves(state, rootDir, moves, options);
  const all = [
    ...gitReasons,
    ...gitMoves,
    ...pathRefusals(changed, targets, state.top, cwd),
    ...moveRefusals(moves, cwd),
    ...caseRefusals(moves, cwd),
    ...refusals,
  ];
  if (all.length > 0) {
    throw new LayerscopeError(
      `Nothing was changed. fix --apply cannot run:\n${all.map(reason => `  - ${reason}`).join('\n')}`,
    );
  }
  const steps: Step[] = [
    ...edits.map((edit): Step => ({ kind: 'edit', edit })),
    ...moves.map((move): Step => ({
      kind: 'move',
      move,
      // A plain rename when git cannot do the move, or does not track the file.
      tracked: usesGit.has(move),
    })),
  ];
  return { moves, steps, byHand, inGit: state.top !== null, allowDirty: options.allowDirty };
}

/** Do the steps in order and stop at the first failure. */
export function runApply(prepared: Prepared, io: ApplyIo): ApplyResult {
  const done: Step[] = [];
  for (const [index, step] of prepared.steps.entries()) {
    let writing: string | null = null;
    try {
      if (step.kind === 'edit') {
        // Another program can save the file after the checks, and this write would replace it.
        if (io.read(step.edit.file) !== step.edit.source) {
          throw new Error(`${step.edit.file} changed since the check`);
        }
        writing = step.edit.file;
        io.write(step.edit.file, step.edit.text);
        writing = null;
      } else {
        io.mkdir(dirname(step.move.to));
        io.move(step.move.from, step.move.to, step.tracked);
      }
    } catch (error) {
      return {
        done,
        pending: prepared.steps.slice(index),
        failure: message(error),
        partial: writing,
      };
    }
    done.push(step);
  }
  return { done, pending: [], failure: null, partial: null };
}
