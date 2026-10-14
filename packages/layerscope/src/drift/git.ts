import { readdirSync } from 'node:fs';

import { basename, dirname, isAbsolute, join, relative } from 'pathe';

import type { Baseline } from '#src/baseline/index.ts';
import { baselinePath, cannotRead, parseBaselineText } from '#src/baseline/index.ts';
import { LayerscopeError } from '#src/errors.ts';
import { isSymlink } from '#src/fix/paths.ts';
import { realPath } from '#src/utils/fs.ts';
import { git, splitNul } from '#src/utils/git.ts';

function assertRef(rootDir: string, ref: string): void {
  try {
    git(rootDir, 'rev-parse', '--verify', `${ref}^{commit}`);
  } catch {
    throw new LayerscopeError(`Unknown git ref "${ref}". Fetch it, or pass another with --base.`);
  }
}

/** The first useful line of what a failed git command printed. */
function firstLine(error: unknown): string {
  const { stderr, message } = error as { stderr?: Buffer | string; message: string };
  const text = String(stderr ?? '').trim() || message;
  return text.split('\n')[0].trim();
}

function unreadable(file: string, ref: string, error: unknown): LayerscopeError {
  return new LayerscopeError(
    `Could not read ${file} at ${ref} (${firstLine(error)}). The git object store may be damaged: run git fsck, or use another ref with --base.`,
  );
}

/** The top of the git work tree of `rootDir`, with its real path. */
function workTree(rootDir: string): string {
  try {
    // Remove only the newline: a dir name can end with a space.
    return realPath(git(rootDir, 'rev-parse', '--show-toplevel').replace(/\r?\n$/u, ''));
  } catch {
    throw new LayerscopeError(`drift needs a git work tree. ${rootDir} is not in one.`);
  }
}

/**
 * The name of the entry `name` in `dir` as the dir has it, without following a link. On a file
 * system that ignores case, the typed name can differ in case. When no entry or more than one
 * entry has the name in another case, or the dir is gone, keep the typed name.
 */
function entryName(dir: string, name: string): string {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return name;
    }
    throw cannotRead(dir, error);
  }
  if (entries.includes(name)) {
    return name;
  }
  const same = entries.filter(entry => entry.toLowerCase() === name.toLowerCase());
  return same.length === 1 ? same[0] : name;
}

function isOutside(path: string): boolean {
  return path === '..' || path.startsWith('../') || isAbsolute(path);
}

/**
 * The paths of the baseline in git, relative to the repository root `top`, and whether the real
 * path is outside `top`. Try the typed path first, then the real path. The real path fixes a
 * symbolic link in a dir and a name in the wrong case. Do not resolve the file name if it is a
 * link: git stores the link at the link name. If the file is gone, keep the name. A path outside
 * `top` is not tried. Limit: if a dir on the path is a link that points to another dir at the ref,
 * drift can read the file at the new target, or find none.
 */
function gitPaths(
  rootDir: string,
  top: string,
  name: string,
): { paths: string[]; outside: boolean } {
  const root = realPath(rootDir);
  const file = baselinePath(root, name);
  const dir = realPath(dirname(file));
  const real = isSymlink(file) ? join(dir, entryName(dir, basename(file))) : realPath(file);
  const candidates = [file, real].map(path => relative(top, path));
  // Put `./` first. Git then does not read a name that starts with `:` as a special form. The
  // repository root becomes `./`.
  const paths = candidates.filter(path => !isOutside(path)).map(path => `./${path}`);
  return { paths: [...new Set(paths)], outside: isOutside(candidates[1]) };
}

/**
 * The git type of `path` at `ref` (`blob`, `tree`, `commit`, `link`), or `null` when the ref has
 * no such path. `ls-tree` only probes: it reads each tree on the path, so a missing tree is an
 * error and not "no such path". It gives the entry of the path itself. `cat-file` gives the type,
 * and it fails when the object is missing. The path is read as given, relative to `top`, and not
 * as a pattern.
 */
function typeAt(top: string, ref: string, name: string, path: string): string | null {
  // For `./`, `ls-tree` lists the children of the root and not the root itself.
  if (path === './') {
    return 'tree';
  }
  try {
    const entries = splitNul(git(top, '--literal-pathspecs', 'ls-tree', '-z', ref, '--', path));
    if (entries.length === 0) {
      return null;
    }
    const [mode, type] = entries[0].split(' ');
    // The commit of a submodule is not in this repository, so `cat-file` cannot read it.
    if (entries.length === 1 && type === 'commit') {
      return 'commit';
    }
    // Git stores a symbolic link as a blob that holds the target path.
    if (entries.length === 1 && mode === '120000') {
      return 'link';
    }
    return git(top, 'cat-file', '-t', `${ref}:${path}`).trim();
  } catch (error) {
    throw unreadable(name, ref, error);
  }
}

/**
 * The first path of the baseline that `ref` has, with its git type, or `null` for none. When `ref`
 * has no path and the real path is outside the repository, the baseline is outside: stop. For
 * example, a dir that is a link to a dir outside the repository, and git stores that link.
 */
function entryAt(
  rootDir: string,
  top: string,
  ref: string,
  name: string,
): { path: string; type: string } | null {
  const { paths, outside } = gitPaths(rootDir, top, name);
  for (const path of paths) {
    const type = typeAt(top, ref, name, path);
    if (type !== null) {
      return { path, type };
    }
  }
  if (outside) {
    throw new LayerscopeError(
      `${name} is outside the git repository ${top}. drift reads the baseline at ${ref} from git. Move the baseline file into the repository, or use --baseline with a path in the repository.`,
    );
  }
  return null;
}

// ponytail: a ref without a baseline file reads as "no violations", so a repo that has not adopted
// a baseline yet sees every current finding as added. A file that is there but not valid is an
// error: it is not the same as no file.
export function baselineAt(rootDir: string, ref: string, name: string): Baseline {
  const top = workTree(rootDir);
  assertRef(rootDir, ref);
  const found = entryAt(rootDir, top, ref, name);
  if (found === null) {
    return { version: 1, entries: [] };
  }
  const { path, type } = found;
  if (type === 'link') {
    throw new LayerscopeError(
      `${name} at ${ref} is a symbolic link. drift does not follow links in git. Commit the baseline file itself, or use --baseline with the path of the file that the link points to, if that file is in the repository.`,
    );
  }
  if (type !== 'blob') {
    throw new LayerscopeError(
      `${name} at ${ref} is not a baseline file. Fix the file on ${ref}, or use another ref with --base.`,
    );
  }
  let text: string;
  try {
    text = git(top, 'show', `${ref}:${path}`);
  } catch (error) {
    throw unreadable(name, ref, error);
  }
  return parseBaselineText(text, name, ref);
}
