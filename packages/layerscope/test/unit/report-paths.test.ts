import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { repoRoot } from '#src/report/paths.ts';
import { gitProject } from '#test/git-project.ts';
import { tempDir } from '#test/watch-project.ts';

describe('repoRoot', () => {
  it('gives the git root for a project inside a repository', () => {
    const repo = gitProject({ nested: true });
    expect(repoRoot(repo.root)).toBe(repo.repo);
  });

  it('gives the project root when there is no git, also for a path that does not exist', () => {
    const dir = tempDir();
    expect(repoRoot(dir)).toBe(dir);
    expect(repoRoot(join(dir, 'missing/deeper'))).toBe(join(dir, 'missing/deeper'));
  });
});
