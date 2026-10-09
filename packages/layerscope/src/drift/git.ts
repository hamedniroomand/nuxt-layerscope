import type { Baseline } from '#src/baseline/index.ts';
import { parseBaseline } from '#src/baseline/index.ts';
import { LayerscopeError } from '#src/errors.ts';
import { git } from '#src/utils/git.ts';

function assertRef(rootDir: string, ref: string): void {
  try {
    git(rootDir, 'rev-parse', '--verify', `${ref}^{commit}`);
  } catch {
    throw new LayerscopeError(`Unknown git ref "${ref}". Fetch it, or pass another with --base.`);
  }
}

// ponytail: a ref without a baseline file reads as "no violations", so a repo that has not adopted
// a baseline yet sees every current finding as added.
export function baselineAt(rootDir: string, ref: string, file: string): Baseline {
  assertRef(rootDir, ref);
  try {
    return parseBaseline(JSON.parse(git(rootDir, 'show', `${ref}:./${file}`)), `${file} at ${ref}`);
  } catch (error) {
    if (error instanceof LayerscopeError) {
      throw error;
    }
    return { version: 1, entries: [] };
  }
}
