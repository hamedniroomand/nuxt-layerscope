import type { Baseline } from '#src/baseline/index.ts';
import { parseBaselineText } from '#src/baseline/index.ts';
import { LayerscopeError } from '#src/errors.ts';
import { git, tryGit } from '#src/utils/git.ts';

function assertRef(rootDir: string, ref: string): void {
  try {
    git(rootDir, 'rev-parse', '--verify', `${ref}^{commit}`);
  } catch {
    throw new LayerscopeError(`Unknown git ref "${ref}". Fetch it, or pass another with --base.`);
  }
}

// ponytail: a ref without a baseline file reads as "no violations", so a repo that has not adopted
// a baseline yet sees every current finding as added. A file that is there but not valid is an
// error: it is not the same as no file.
export function baselineAt(rootDir: string, ref: string, file: string): Baseline {
  assertRef(rootDir, ref);
  // The same `ref:./file` form as `git show`, so the path rules are the same.
  const spec = `${ref}:./${file}`;
  const kind = tryGit(rootDir, 'cat-file', '-t', spec)?.trim();
  if (kind === undefined) {
    return { version: 1, entries: [] };
  }
  if (kind !== 'blob') {
    throw new LayerscopeError(
      `${file} at ${ref} is not a baseline file. Fix the file on ${ref}, or use another ref with --base.`,
    );
  }
  return parseBaselineText(git(rootDir, 'show', spec), file, ref);
}
