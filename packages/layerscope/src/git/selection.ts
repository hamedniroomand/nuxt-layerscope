import { isAbsolute, resolve } from 'pathe';

import { LayerscopeError } from '#src/errors.ts';
import { git, splitNul, tryGit } from '#src/utils/git.ts';

/** The files that `layerscope` scans: the same extensions as `collectFiles`. */
const SOURCE = /\.(?:vue|ts|tsx|mts|cts|js|jsx|mjs|cjs)$/u;

export interface Selection {
  /** Absolute paths of the files to check, source files only. */
  files: string[];
  /** Files that git lists as deleted: their uses in other files are not checked. */
  deleted: number;
  /** The message for a selection that holds nothing to check. */
  none: string;
}

export function isSourceFile(file: string): boolean {
  return SOURCE.test(file);
}

function assertRepository(rootDir: string, flag: string): void {
  if (tryGit(rootDir, 'rev-parse', '--is-inside-work-tree') === null) {
    throw new LayerscopeError(`${flag} needs a git repository, and git must be installed.`);
  }
}

/** Paths from git come relative to `rootDir` with `--relative`, and only from inside it. */
function names(rootDir: string, ...args: string[]): string[] {
  return splitNul(git(rootDir, ...args)).map(path => resolve(rootDir, path));
}

function toSelection(files: string[], deleted: string[], none: string): Selection {
  return {
    files: [...new Set(files)].filter(file => isSourceFile(file)).toSorted(),
    deleted: deleted.filter(file => isSourceFile(file)).length,
    none,
  };
}

/** Files staged for commit: added, copied, modified or renamed. */
export function stagedFiles(rootDir: string): Selection {
  assertRepository(rootDir, '--staged');
  const base = ['diff', '--cached', '--name-only', '-z', '--relative'];
  return toSelection(
    names(rootDir, ...base, '--diff-filter=ACMR'),
    names(rootDir, ...base, '--diff-filter=D'),
    'No staged source files to check.',
  );
}

const FETCH_HINT =
  'Fetch the base branch, for example actions/checkout with fetch-depth: 0, or pass --since <ref>.';

/**
 * The merge base with the default branch, or `HEAD` on it. Throws when no default branch has a
 * merge base: a shallow or detached CI checkout, where `HEAD` would hide every change.
 */
export function defaultRef(rootDir: string): string {
  const remote = tryGit(rootDir, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD')?.trim();
  const head = tryGit(rootDir, 'rev-parse', 'HEAD')?.trim();
  const candidates = [remote, 'main', 'master', 'origin/main', 'origin/master'];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === '') {
      continue;
    }
    const base = tryGit(rootDir, 'merge-base', 'HEAD', candidate)?.trim();
    if (base !== undefined && base !== '') {
      // On the default branch itself the base is HEAD: only the uncommitted work is new.
      return base === head ? 'HEAD' : base;
    }
  }
  throw new LayerscopeError(`--changed found no merge base with the default branch. ${FETCH_HINT}`);
}

/** The commit that `--since` diffs from: the merge base with `ref`, or `ref` when there is none. */
function sinceBase(rootDir: string, ref: string): string {
  const base = tryGit(rootDir, 'merge-base', 'HEAD', ref)?.trim();
  return base === undefined || base === '' ? ref : base;
}

/** Whether the repository has a commit. Before the first one, every tracked file is new. */
function hasCommit(rootDir: string): boolean {
  return tryGit(rootDir, 'rev-parse', '--verify', 'HEAD^{commit}') !== null;
}

/** Files of a repository without a commit: the index holds every file, and some may be gone. */
function beforeFirstCommit(rootDir: string): Selection {
  const gone = names(rootDir, 'ls-files', '--deleted', '-z');
  const missing = new Set(gone);
  const tracked = names(rootDir, 'ls-files', '-z').filter(file => !missing.has(file));
  const untracked = names(rootDir, 'ls-files', '--others', '--exclude-standard', '-z');
  return toSelection([...tracked, ...untracked], gone, 'No changed source files to check.');
}

/** Files that differ from `ref` in the working tree, and untracked files. */
export function changedFiles(rootDir: string, ref?: string): Selection {
  assertRepository(rootDir, ref === undefined ? '--changed' : '--since');
  if (ref !== undefined && tryGit(rootDir, 'rev-parse', '--verify', `${ref}^{commit}`) === null) {
    throw new LayerscopeError(`Unknown git ref "${ref}". Fetch it, or pass another with --since.`);
  }
  if (!hasCommit(rootDir)) {
    return beforeFirstCommit(rootDir);
  }
  const base = ref === undefined ? defaultRef(rootDir) : sinceBase(rootDir, ref);
  const diff = ['diff', '--name-only', '-z', '--relative'];
  const tracked = names(rootDir, ...diff, '--diff-filter=ACMR', base);
  const untracked = names(rootDir, 'ls-files', '--others', '--exclude-standard', '-z');
  return toSelection(
    [...tracked, ...untracked],
    names(rootDir, ...diff, '--diff-filter=D', base),
    'No changed source files to check.',
  );
}

/** Paths from the command line, which are relative to the working directory. */
export function pathSelection(files: string[]): Selection {
  const absolute = files.map(file => (isAbsolute(file) ? file : resolve(process.cwd(), file)));
  return {
    files: [...new Set(absolute)].filter(file => isSourceFile(file)).toSorted(),
    deleted: 0,
    none: 'No source files to check.',
  };
}
