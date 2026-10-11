import { execFileSync } from 'node:child_process';
import { copyFileSync, realpathSync } from 'node:fs';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { stagedFiles } from '#src/git/selection.ts';
import { git } from '#test/git-project.ts';
import { tempDir, write } from '#test/watch-project.ts';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** A repository with one commit. */
function repository(): string {
  const repo = realpathSync(tempDir());
  git(repo, 'init', '-q', '-b', 'main');
  write(repo, 'sub/base.ts', 'export default 0;\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'base');
  return repo;
}

/** Stages `file` in a copy of the index, as a hook does for `git commit` (`index.lock`). */
function lockIndex(repo: string, gitDir: string, file: string): string {
  const index = join(gitDir, 'index.lock');
  copyFileSync(join(gitDir, 'index'), index);
  write(repo, file, 'export default 1;\n');
  execFileSync('git', ['-C', repo, 'add', file], {
    env: { ...process.env, GIT_INDEX_FILE: index },
  });
  return index;
}

describe('git env in a git hook', () => {
  it('reads the index of the hook, an absolute path (index.lock stands for next-index-*.lock)', () => {
    const repo = realpathSync(repository());
    vi.stubEnv('GIT_INDEX_FILE', lockIndex(repo, join(repo, '.git'), 'sub/locked.ts'));
    expect(stagedFiles(repo).files).toEqual([join(repo, 'sub/locked.ts')]);
  });

  it('reads the index of the hook, a path relative to the folder where the hook runs', () => {
    const repo = realpathSync(repository());
    lockIndex(repo, join(repo, '.git'), 'sub/locked.ts');
    vi.spyOn(process, 'cwd').mockReturnValue(repo);
    vi.stubEnv('GIT_INDEX_FILE', '.git/index.lock');
    expect(stagedFiles(join(repo, 'sub')).files).toEqual([join(repo, 'sub/locked.ts')]);
  });

  it('ignores an index of another repository', () => {
    const repo = repository();
    const other = repository();
    write(repo, 'sub/own.ts', 'export default 2;\n');
    git(repo, 'add', 'sub/own.ts');
    vi.stubEnv('GIT_INDEX_FILE', lockIndex(other, join(other, '.git'), 'sub/foreign.ts'));
    expect(stagedFiles(repo).files).toEqual([join(repo, 'sub/own.ts')]);
  });

  it('uses the index of a linked worktree when the hook sets its git dir', () => {
    const repo = repository();
    const tree = join(realpathSync(tempDir()), 'tree');
    git(repo, 'worktree', 'add', '-q', '-b', 'other', tree);
    const gitDir = git(tree, 'rev-parse', '--absolute-git-dir').trim();
    vi.stubEnv('GIT_DIR', gitDir);
    vi.stubEnv('GIT_INDEX_FILE', lockIndex(tree, gitDir, 'sub/locked.ts'));
    expect(stagedFiles(join(tree, 'sub')).files).toEqual([join(tree, 'sub/locked.ts')]);
  });

  it('ignores the index of a linked worktree when rootDir is the main worktree', () => {
    const repo = repository();
    const tree = join(realpathSync(tempDir()), 'tree');
    git(repo, 'worktree', 'add', '-q', '-b', 'other', tree);
    const gitDir = git(tree, 'rev-parse', '--absolute-git-dir').trim();
    vi.stubEnv('GIT_INDEX_FILE', lockIndex(tree, gitDir, 'sub/locked.ts'));
    expect(stagedFiles(repo).files).toEqual([]);
  });
});
