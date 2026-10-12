import type { Baseline } from '#src/baseline/index.ts';
import { parseBaselineText } from '#src/baseline/index.ts';
import { LayerscopeError } from '#src/errors.ts';
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

/**
 * The git type of `file` at `ref` (`blob`, `tree`, `commit`), or `null` when the ref has no such
 * path. `ls-tree` only probes: it reads each tree on the path, so a missing tree is an error and
 * not "no such path". For a folder it lists the children, so the type comes from `cat-file`. The
 * path is read as given, relative to `rootDir`, and not as a pattern.
 */
function typeAt(rootDir: string, ref: string, file: string): string | null {
  try {
    const entries = splitNul(git(rootDir, '--literal-pathspecs', 'ls-tree', '-z', ref, '--', file));
    if (entries.length === 0) {
      return null;
    }
    // The commit of a submodule is not in this repository, so `cat-file` cannot read it.
    if (entries.length === 1 && entries[0].split(' ')[1] === 'commit') {
      return 'commit';
    }
    return git(rootDir, 'cat-file', '-t', `${ref}:./${file}`).trim();
  } catch (error) {
    throw unreadable(file, ref, error);
  }
}

// ponytail: a ref without a baseline file reads as "no violations", so a repo that has not adopted
// a baseline yet sees every current finding as added. A file that is there but not valid is an
// error: it is not the same as no file.
export function baselineAt(rootDir: string, ref: string, file: string): Baseline {
  assertRef(rootDir, ref);
  const type = typeAt(rootDir, ref, file);
  if (type === null) {
    return { version: 1, entries: [] };
  }
  if (type !== 'blob') {
    throw new LayerscopeError(
      `${file} at ${ref} is not a baseline file. Fix the file on ${ref}, or use another ref with --base.`,
    );
  }
  let text: string;
  try {
    // The same path rules as in `typeAt`.
    text = git(rootDir, 'show', `${ref}:./${file}`);
  } catch (error) {
    throw unreadable(file, ref, error);
  }
  return parseBaselineText(text, file, ref);
}
