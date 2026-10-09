import { isAbsolute, resolve } from 'pathe';

import { LayerscopeError } from '#src/errors.ts';
import { git, splitNul, tryGit } from '#src/utils/git.ts';

/** The files that `layerscope` scans: the same extensions as `collectFiles`. */
const SOURCE = /\.(?:vue|ts|tsx|mts|js|jsx|mjs)$/u;

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

/** The merge base with the default branch, or `HEAD` on it or when there is none. */
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
  return 'HEAD';
}

/** Files that differ from `ref` in the working tree, and untracked files. */
export function changedFiles(rootDir: string, ref?: string): Selection {
  assertRepository(rootDir, ref === undefined ? '--changed' : '--since');
  if (ref !== undefined && tryGit(rootDir, 'rev-parse', '--verify', `${ref}^{commit}`) === null) {
    throw new LayerscopeError(`Unknown git ref "${ref}". Fetch it, or pass another with --since.`);
  }
  const base = ref ?? defaultRef(rootDir);
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
