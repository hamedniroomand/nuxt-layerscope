import { describe, expect, it } from 'vite-plus/test';

import { BAD, check, files, gitProject, reportOf } from './git-project.ts';

const PAGE0 = 'layers/a/app/pages/p0.vue';
const PAGE1 = 'layers/a/app/pages/p1.vue';

describe('check --staged', () => {
  it('reports the staged files and not the unstaged ones', async () => {
    const repo = gitProject();
    repo.write(PAGE0, BAD);
    repo.write(PAGE1, BAD);
    repo.git('add', PAGE0);
    const result = await check([repo.root, '--staged', '--format', 'json'], repo.root);
    const report = reportOf(result);
    expect(files(report)).toEqual([PAGE0]);
    expect(result.code).toBe(1);
    expect(report.notes.join('\n')).toContain('Findings are shown for 1 of');
  });
});

describe('check --staged with new, renamed and deleted files', () => {
  it('checks a staged new file, a rename and a name with spaces', async () => {
    const repo = gitProject();
    repo.write('layers/a/app/pages/my page.vue', BAD);
    repo.write('layers/a/app/pages/new.vue', BAD);
    repo.git('mv', PAGE1, 'layers/a/app/pages/renamed.vue');
    repo.write('layers/a/app/pages/renamed.vue', BAD);
    repo.git('add', '-A');
    const report = reportOf(await check([repo.root, '--staged', '--format', 'json'], repo.root));
    expect(files(report).toSorted()).toEqual([
      'layers/a/app/pages/my page.vue',
      'layers/a/app/pages/new.vue',
      'layers/a/app/pages/renamed.vue',
    ]);
  });

  it('does not scan a staged deletion, and says that it was one', async () => {
    const repo = gitProject();
    repo.write(PAGE1, BAD);
    repo.git('add', PAGE1);
    repo.git('rm', '-q', PAGE0);
    const report = reportOf(await check([repo.root, '--staged', '--format', 'json'], repo.root));
    expect(files(report)).toEqual([PAGE1]);
    expect(report.notes.join('\n')).toContain('1 deleted source file');
  });

  it('exits 0 when the error is in a file that is not staged', async () => {
    const repo = gitProject();
    repo.write(PAGE0, BAD);
    repo.write(PAGE1, `${BAD}<!-- changed -->\n`);
    repo.git('add', PAGE1);
    repo.git('commit', '-q', '-m', 'bad');
    repo.write('layers/a/app/pages/ok.vue', '<template><div /></template>\n');
    repo.git('add', 'layers/a/app/pages/ok.vue');
    const result = await check([repo.root, '--staged', '--format', 'json'], repo.root);
    expect(files(reportOf(result))).toEqual([]);
    expect(result.code).toBe(0);
  });
});

describe('check --staged with nothing to check', () => {
  it('exits at once when nothing is staged, even when the project could not be analyzed', async () => {
    const repo = gitProject();
    // Without `.nuxt` a full check stops with an error: this one never looks at it.
    repo.git('rm', '-rq', '--cached', '.');
    repo.git('commit', '-q', '-m', 'empty');
    const result = await check([repo.root, '--staged'], repo.root);
    expect(result).toMatchObject({ code: 0, out: '' });
    expect(result.err).toContain('No staged source files to check.');
  });

  it('exits at once when only files that are not source are staged', async () => {
    const repo = gitProject();
    repo.write('README.md', '# readme\n');
    repo.write('data.json', '{}\n');
    repo.git('add', '-A');
    const result = await check([repo.root, '--staged'], repo.root);
    expect(result.code).toBe(0);
    expect(result.err).toContain('No staged source files to check.');
  });

  it('prints a valid, empty report in a machine format when nothing is staged', async () => {
    const repo = gitProject();
    const result = await check([repo.root, '--staged', '--format', 'json'], repo.root);
    expect(result.code).toBe(0);
    expect(reportOf(result).findings).toEqual([]);
    expect(result.err).toContain('No staged source files to check.');
  });
});
