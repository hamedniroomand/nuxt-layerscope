import { describe, expect, it } from 'vite-plus/test';

import { BAD, check, files, gitProject, reportOf } from './git-project.ts';

const PAGE0 = 'layers/a/app/pages/p0.vue';
const PAGE1 = 'layers/a/app/pages/p1.vue';
const NEW = 'layers/a/app/pages/new.vue';
const OLD = 'layers/a/app/pages/old.vue';

/** `main` has a bad `old.vue`; the branch changes `p0` (committed), `p1` (uncommitted) and `new`. */
function branch(): ReturnType<typeof gitProject> {
  const repo = gitProject();
  repo.write(OLD, BAD);
  repo.commit('old violation');
  repo.git('switch', '-q', '-c', 'feature');
  repo.write(PAGE0, BAD);
  repo.commit('feature');
  repo.write(PAGE1, BAD);
  repo.write(NEW, BAD);
  return repo;
}

describe('check --changed', () => {
  it('reports what changed since the default branch, committed or not, and untracked files', async () => {
    const repo = branch();
    const result = await check([repo.root, '--changed', '--format', 'json'], repo.root);
    expect(files(reportOf(result)).toSorted()).toEqual([NEW, PAGE0, PAGE1]);
    expect(result.code).toBe(1);
  });

  it('leaves out a violation that the default branch already has', async () => {
    const repo = branch();
    const report = reportOf(await check([repo.root, '--changed', '--format', 'json'], repo.root));
    expect(files(report)).not.toContain(OLD);
  });

  it('takes only the uncommitted work on the default branch itself', async () => {
    const repo = gitProject();
    repo.write(OLD, BAD);
    repo.commit('old violation');
    repo.write(PAGE1, BAD);
    const report = reportOf(await check([repo.root, '--changed', '--format', 'json'], repo.root));
    expect(files(report)).toEqual([PAGE1]);
  });

  it('takes another ref with --since, which implies --changed', async () => {
    const repo = branch();
    const report = reportOf(
      await check([repo.root, '--since', 'HEAD~1', '--format', 'json'], repo.root),
    );
    // Since the commit before `feature`: the commit of `feature` and the uncommitted files.
    expect(files(report).toSorted()).toEqual([NEW, PAGE0, PAGE1]);
    const head = reportOf(
      await check([repo.root, '--since', 'HEAD', '--format', 'json'], repo.root),
    );
    expect(files(head).toSorted()).toEqual([NEW, PAGE1]);
  });

  it('refuses a ref that does not exist', async () => {
    const repo = gitProject();
    const result = await check([repo.root, '--since', 'nope'], repo.root);
    expect(result.code).toBe(2);
    expect(result.err).toContain('Unknown git ref "nope"');
  });

  it('exits at once when nothing changed', async () => {
    const repo = gitProject();
    const result = await check([repo.root, '--changed'], repo.root);
    expect(result).toMatchObject({ code: 0, out: '' });
    expect(result.err).toContain('No changed source files to check.');
  });
});
