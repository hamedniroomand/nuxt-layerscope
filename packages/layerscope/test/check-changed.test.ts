import { rmSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { BAD, check, files, git, gitProject, reportOf } from './git-project.ts';
import { tempDir, write } from './watch-project.ts';

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

/** A project in a new repository: no commit yet, and the files that a Nuxt project needs. */
function unborn(): string {
  const root = tempDir();
  write(root, '.nuxt/types/imports.d.ts', 'export {}\ndeclare global {}\n');
  write(root, '.nuxt/components.d.ts', '\n');
  write(root, 'layerscope.config.mjs', "export default { layers: { a: { path: 'layers/a' } } };\n");
  write(root, '.gitignore', '.nuxt\n');
  git(root, 'init', '-q', '-b', 'main');
  return root;
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

describe('check --changed on the default branch', () => {
  it('takes the commits that are not on origin yet when it is on the default branch', async () => {
    const repo = gitProject();
    repo.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    repo.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
    repo.write(PAGE0, BAD);
    repo.commit('unpushed');
    repo.write(PAGE1, BAD);
    const report = reportOf(await check([repo.root, '--changed', '--format', 'json'], repo.root));
    expect(files(report).toSorted()).toEqual([PAGE0, PAGE1]);
  });
});

describe('check --since and the first commit', () => {
  it('diffs --since from the merge base, so work that landed on main is not checked', async () => {
    const repo = gitProject();
    repo.git('switch', '-q', '-c', 'feature');
    repo.write(PAGE0, BAD);
    repo.commit('feature');
    repo.git('switch', '-q', 'main');
    repo.write('layers/a/app/pages/landed.vue', BAD);
    repo.commit('landed');
    repo.git('switch', '-q', 'feature');
    const report = reportOf(
      await check([repo.root, '--since', 'main', '--format', 'json'], repo.root),
    );
    expect(files(report)).toEqual([PAGE0]);
  });

  it('takes a ref as it is when there is no merge base', async () => {
    const repo = gitProject();
    repo.write(PAGE0, BAD);
    const tree = repo.git('write-tree').trim();
    const unrelated = repo.git('commit-tree', '-m', 'unrelated', tree).trim();
    repo.git('update-ref', 'refs/heads/other', unrelated);
    const report = reportOf(
      await check([repo.root, '--since', 'other', '--format', 'json'], repo.root),
    );
    expect(files(report)).toEqual([PAGE0]);
  });
});

describe('check --changed before the first commit', () => {
  it('works in a repository without a commit', async () => {
    const root = unborn();
    write(root, PAGE0, BAD);
    git(root, 'add', PAGE0);
    const result = await check([root, '--changed', '--format', 'json'], root);
    expect(result.err).not.toContain('Command failed');
    expect(files(reportOf(result))).toEqual([PAGE0]);
  });

  it('leaves out a file that is deleted on disk before the first commit, and says so', async () => {
    const root = unborn();
    write(root, PAGE0, BAD);
    write(root, PAGE1, BAD);
    git(root, 'add', PAGE0, PAGE1);
    rmSync(join(root, PAGE1));
    const result = await check([root, '--changed', '--format', 'json'], root);
    const report = reportOf(result);
    expect(files(report)).toEqual([PAGE0]);
    expect(report.notes.join('\n')).toContain('1 deleted source file');
    // Only the config file, an untracked source file in no layer, is skipped: not the deleted page.
    expect(report.notes.join('\n')).toContain('1 selected file is in no layer');
  });

  it('refuses an unknown ref before the first commit', async () => {
    const root = tempDir();
    write(
      root,
      'layerscope.config.mjs',
      "export default { layers: { a: { path: 'layers/a' } } };\n",
    );
    git(root, 'init', '-q', '-b', 'main');
    const result = await check([root, '--since', 'nope'], root);
    expect(result.code).toBe(2);
    expect(result.err).toContain('Unknown git ref "nope"');
  });
});

describe('check --changed without a merge base', () => {
  function clone(options: string[]): string {
    const repo = branch();
    repo.commit('wip');
    const target = tempDir();
    git(target, 'clone', '-q', ...options, `file://${repo.repo}`, 'clone');
    return `${target}/clone`;
  }

  it('exits 2 with a hint in a shallow clone of a branch', async () => {
    const root = clone(['--depth', '1', '--branch', 'feature']);
    const result = await check([root, '--changed'], root);
    expect(result.code).toBe(2);
    expect(result.err).toContain('fetch-depth: 0');
    expect(result.err).toContain('--since <ref>');
  });

  it('exits 2 with a hint in a detached checkout with no base branch', async () => {
    const root = clone(['--depth', '1', '--branch', 'feature']);
    git(root, 'checkout', '-q', '--detach');
    git(root, 'branch', '-q', '-D', 'feature');
    const result = await check([root, '--changed'], root);
    expect(result.code).toBe(2);
  });

  it('still works with --since', async () => {
    const root = clone(['--depth', '1', '--branch', 'feature']);
    write(root, '.nuxt/types/imports.d.ts', 'export {}\ndeclare global {}\n');
    write(root, '.nuxt/components.d.ts', '\n');
    const result = await check([root, '--since', 'HEAD', '--format', 'json'], root);
    expect(result.err).toContain('No changed source files');
    expect(result.code).toBe(0);
  });
});
