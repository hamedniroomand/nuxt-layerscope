import { join, normalize, relative } from 'pathe';

import { realPath } from '#src/utils/fs.ts';
import { git, splitNul, tryGit } from '#src/utils/git.ts';
import { plural } from '#src/utils/strings.ts';

import { existingDir } from './paths.ts';

const SUBMODULE_MODE = '160000';

export interface GitState {
  /** The top dir of the work tree, or `null` when git has no repository for the root. */
  top: string | null;
  /** The first line that git printed, when it failed for another reason than "no repository". */
  error: string | null;
  /** Entries of `git status` for the whole repository: changes and untracked files. */
  changes: number;
  /** Files in the index of the top repository. */
  tracked: Set<string>;
  /** Files that are marked assume-unchanged or skip-worktree: `git status` does not show them. */
  hidden: Set<string>;
  submodules: string[];
}

function firstLine(error: unknown): string {
  const { stderr } = error as { stderr?: unknown };
  const text = typeof stderr === 'string' ? stderr : (error as Error).message;
  return text.split('\n').find(line => line.trim() !== '') ?? 'git failed';
}

function emptyState(error: string | null): GitState {
  return {
    top: null,
    error,
    changes: 0,
    tracked: new Set(),
    hidden: new Set(),
    submodules: [],
  };
}

function readIndex(
  rootDir: string,
  top: string,
): Pick<GitState, 'tracked' | 'hidden' | 'submodules'> {
  const tracked = new Set<string>();
  const submodules: string[] = [];
  for (const entry of splitNul(git(rootDir, 'ls-files', '-s', '-z', '--full-name'))) {
    // `<mode> <object> <stage>\t<path>`
    const [info, path] = entry.split('\t');
    const [mode, , stage] = info.split(' ');
    if (mode === SUBMODULE_MODE) {
      submodules.push(join(top, path));
    } else if (stage === '0') {
      tracked.add(join(top, path));
    }
  }
  const hidden = new Set<string>();
  for (const entry of splitNul(git(rootDir, 'ls-files', '-v', '-z', '--full-name'))) {
    // `<tag> <path>`: `S` is skip-worktree, a lower case tag is assume-unchanged.
    if (entry[0] === 'S' || entry[0] !== entry[0].toUpperCase()) {
      hidden.add(join(top, entry.slice(2)));
    }
  }
  return { tracked, hidden, submodules };
}

export function readState(rootDir: string): GitState {
  let top: string;
  try {
    top = normalize(realPath(git(rootDir, 'rev-parse', '--show-toplevel').trim()));
  } catch (error) {
    const line = firstLine(error);
    return emptyState(/not a git repository/iu.test(line) ? null : line);
  }
  const changes = splitNul(
    git(rootDir, 'status', '--porcelain', '-z', '--no-renames', '--untracked-files=all'),
  );
  return { top, error: null, changes: changes.length, ...readIndex(rootDir, top) };
}

export function has(files: Set<string>, path: string): boolean {
  return files.has(normalize(path));
}

/** Whether `file` is below `dir`. Both are normalized, so a Windows path works too. */
export function isInside(file: string, dir: string): boolean {
  return normalize(file).startsWith(`${normalize(dir).replace(/\/$/u, '')}/`);
}

export function inSubmodule(state: GitState, path: string): boolean {
  return state.submodules.some(dir => normalize(path) === dir || isInside(path, dir));
}

/** Why git would not show a change to the file, or `null` when it would. */
function fileProblem(state: GitState, file: string): string | null {
  if (inSubmodule(state, file)) {
    return 'is in a git submodule, so `git status` and `git diff` of this repository would not show a change there. Use --allow-dirty to do it anyway.';
  }
  if (!has(state.tracked, file)) {
    return 'is not tracked by git, so `git status` and `git diff` would not show a change to it. Add it to git, or use --allow-dirty.';
  }
  return has(state.hidden, file)
    ? 'is marked assume-unchanged or skip-worktree in git, so `git status` would not show a change to it. Clear the mark, or use --allow-dirty.'
    : null;
}

/** Why git would not show a move to the path, or `null` when it would. */
export function targetProblem(state: GitState, target: string): string | null {
  if (state.top === null || !isInside(target, state.top)) {
    return 'is outside the git repository, so `git status` and `git diff` would not show a move there. Use --allow-dirty to do it anyway.';
  }
  return inSubmodule(state, target)
    ? 'is in a git submodule, so `git status` and `git diff` of this repository would not show a move there. Use --allow-dirty to do it anyway.'
    : null;
}

/** One line for each file or target that git would not show a change to. */
export function trackingRefusals(
  state: GitState,
  files: Set<string>,
  targets: string[],
  cwd: string,
): string[] {
  const problems = [
    ...[...files].map(path => ({ path, problem: fileProblem(state, path) })),
    ...targets.map(path => ({ path, problem: targetProblem(state, path) })),
  ];
  return problems.flatMap(({ path, problem }) =>
    problem === null ? [] : [`${relative(cwd, path)} ${problem}`],
  );
}

export function gitRefusals(state: GitState, rootDir: string, cwd: string): string[] {
  if (state.top === null) {
    const where = relative(cwd, rootDir) || '.';
    return [
      state.error === null
        ? `${where} is not in a git repository. Put the project in git, so that \`git status\` and \`git diff\` show the changes of \`--apply\`, or use --allow-dirty.`
        : `Cannot read the git state of ${where}: ${state.error}`,
    ];
  }
  return state.changes === 0
    ? []
    : [
        `The git working tree of the repository has changes or untracked files (${plural(state.changes, 'file')}). Commit them, stash them with \`git stash -u\`, or remove them, so that \`git status\` and \`git diff\` show only the changes of \`--apply\`. Or use --allow-dirty.`,
      ];
}

/**
 * Why git would refuse to move the file, found with `git mv -n`, or `null` when it would not. A
 * target outside a sparse checkout is refused. Git does that after the edits are written, so it
 * is checked before the first write.
 */
export function gitMoveProblem(
  rootDir: string,
  from: string,
  to: string,
): { sparse: boolean; line: string } | null {
  try {
    git(rootDir, 'mv', '-n', '--', from, to);
    return null;
  } catch (error) {
    const { stderr } = error as { stderr?: unknown };
    return typeof stderr === 'string' && stderr.includes('sparse-checkout')
      ? { sparse: true, line: 'the target is outside the sparse checkout.' }
      : { sparse: false, line: firstLine(error) };
  }
}

/**
 * Whether the target is in the repository of `top` and not in another one that has its own `.git`
 * (a nested repository that the outer repository ignores). `git mv` would stage the file in the
 * index of the outer repository, and `git status` of it would not show the file in the nested one.
 */
export function inSameRepository(target: string, top: string): boolean {
  const found = tryGit(existingDir(target), 'rev-parse', '--show-toplevel');
  return found !== null && normalize(realPath(found.trim())) === top;
}
