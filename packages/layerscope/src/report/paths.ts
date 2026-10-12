import { execFileSync } from 'node:child_process';

import { relative } from 'pathe';

import { realPath } from '#src/utils/fs.ts';
import { cleanGitEnv } from '#src/utils/git.ts';

/** The git root of the project, or the project root when there is no git (StackBlitz, tarballs). */
export function repoRoot(rootDir: string): string {
  try {
    // A git hook sets `GIT_DIR`. Git then uses that repository, not the one of `rootDir`.
    const out = execFileSync('git', ['-C', realPath(rootDir), 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      env: cleanGitEnv(),
      stdio: 'pipe',
    });
    return realPath(out.trim());
  } catch {
    return realPath(rootDir);
  }
}

/** Relative to the repository root, with forward slashes, for code scanning and GitLab. */
export function repoPath(file: string, root: string): string {
  return relative(realPath(root), realPath(file));
}
