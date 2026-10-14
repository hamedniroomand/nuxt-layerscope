import { relative } from 'pathe';

import { realPath } from '#src/utils/fs.ts';
import { topLevel } from '#src/utils/git.ts';

/** The git root of the project, or the project root when there is no git (StackBlitz, tarballs). */
export function repoRoot(rootDir: string): string {
  try {
    // `topLevel` removes the variables of a git hook, such as `GIT_DIR`, so git reads the
    // repository of `rootDir`.
    return realPath(topLevel(realPath(rootDir)));
  } catch {
    return realPath(rootDir);
  }
}

/** Relative to the repository root, with forward slashes, for code scanning and GitLab. */
export function repoPath(file: string, root: string): string {
  return relative(realPath(root), realPath(file));
}
