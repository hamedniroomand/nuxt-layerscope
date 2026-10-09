import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { splitArguments } from '#src/commands/check-files.ts';

import { BAD, check, files, gitProject, reportOf } from './git-project.ts';
import { tempDir } from './watch-project.ts';

const PAGE0 = 'layers/a/app/pages/p0.vue';
const PAGE1 = 'layers/a/app/pages/p1.vue';

describe('splitArguments', () => {
  it('takes a first argument that is a directory as the root, and the rest as files', () => {
    const dir = tempDir();
    expect(splitArguments(dir, ['a.ts', 'b.ts'])).toEqual({ root: dir, files: ['a.ts', 'b.ts'] });
    expect(splitArguments(dir, [])).toEqual({ root: dir, files: [] });
  });

  it('keeps a single argument that does not exist as the root, for the old error', () => {
    expect(splitArguments('nope', [])).toEqual({ root: 'nope', files: [] });
  });

  it('takes arguments that are files as files, with the working directory as the root', () => {
    const dir = tempDir();
    const file = join(dir, 'a.ts');
    expect(splitArguments(file, ['b.ts'])).toEqual({ root: undefined, files: [file, 'b.ts'] });
    expect(splitArguments(undefined, [])).toEqual({ root: undefined, files: [] });
  });
});

describe('check with files', () => {
  it('checks the files that are given after the root', async () => {
    const repo = gitProject();
    repo.write(PAGE0, BAD);
    repo.write(PAGE1, BAD);
    const result = await check([repo.root, join(repo.root, PAGE0), '--format', 'json'], repo.root);
    expect(files(reportOf(result))).toEqual([PAGE0]);
    expect(result.code).toBe(1);
  });

  it('checks files without a root, as lint-staged passes them, relative to the working directory', async () => {
    const repo = gitProject();
    repo.write(PAGE0, BAD);
    repo.write(PAGE1, BAD);
    const result = await check([PAGE1, '--format', 'json'], repo.root);
    expect(files(reportOf(result))).toEqual([PAGE1]);
  });

  it('skips a file outside the project, or in no layer, and says how many', async () => {
    const repo = gitProject();
    repo.write(PAGE0, BAD);
    const outside = join(tempDir(), 'other.ts');
    const result = await check(
      [
        repo.root,
        join(repo.root, PAGE0),
        outside,
        join(repo.root, 'missing.ts'),
        '--format',
        'json',
      ],
      repo.root,
    );
    const report = reportOf(result);
    expect(files(report)).toEqual([PAGE0]);
    expect(report.notes.join('\n')).toContain('2 selected files are in no layer');
  });

  it('exits 0 at once when no argument is a source file', async () => {
    const repo = gitProject();
    const result = await check([repo.root, join(repo.root, 'README.md')], repo.root);
    expect(result).toMatchObject({ code: 0, out: '' });
    expect(result.err).toContain('No source files to check.');
  });
});

describe('check in a repository with several projects', () => {
  it('limits --staged to the project, and skips a staged file of a sibling package', async () => {
    const repo = gitProject({ nested: true });
    repo.write('apps/web/layers/a/app/pages/p0.vue', BAD);
    repo.write('apps/other/a.ts', 'export const other = 2;\n');
    repo.git('add', '-A');
    const report = reportOf(await check([repo.root, '--staged', '--format', 'json'], repo.root));
    expect(files(report)).toEqual([PAGE0]);
    expect(report.notes.join('\n')).not.toContain('no layer');
  });

  it('takes the root first and the absolute paths of all staged files, as lint-staged passes them', async () => {
    const repo = gitProject({ nested: true });
    repo.write('apps/web/layers/a/app/pages/p0.vue', BAD);
    repo.write('apps/other/a.ts', 'export const other = 2;\n');
    repo.git('add', '-A');
    const result = await check(
      [
        'apps/web',
        join(repo.repo, 'apps/web', PAGE0),
        join(repo.repo, 'apps/other/a.ts'),
        '--format',
        'json',
      ],
      repo.repo,
    );
    const report = reportOf(result);
    expect(report.findings.map(finding => finding.symbol)).toEqual(['./missing']);
    expect(report.notes.join('\n')).toContain('1 selected file is in no layer');
    expect(result.code).toBe(1);
  });
});
