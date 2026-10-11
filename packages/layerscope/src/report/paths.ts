import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

import { basename, dirname, join, relative } from 'pathe';

import { cleanGitEnv } from '#src/utils/git.ts';

/** Follows symlinks of the longest part that exists, so a missing file still gets a real path. */
function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    const parent = dirname(path);
    return parent === path ? path : join(real(parent), basename(path));
  }
}

/** The git root of the project, or the project root when there is no git (StackBlitz, tarballs). */
export function repoRoot(rootDir: string): string {
  try {
    // A git hook sets `GIT_DIR`. Git then uses that repository, not the one of `rootDir`.
    const out = execFileSync('git', ['-C', real(rootDir), 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      env: cleanGitEnv(),
      stdio: 'pipe',
    });
    return real(out.trim());
  } catch {
    return real(rootDir);
  }
}

/** Relative to the repository root, with forward slashes, for code scanning and GitLab. */
export function repoPath(file: string, root: string): string {
  return relative(real(root), real(file));
}
