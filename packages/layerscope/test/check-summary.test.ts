import { readFileSync, writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { BAD, check, gitProject } from './git-project.ts';
import { tempDir } from './watch-project.ts';

const PAGE = 'layers/a/app/pages/p0.vue';

describe('check --summary', () => {
  it('writes the count and the list of the findings, and keeps the annotations on stdout', async () => {
    const repo = gitProject();
    repo.write(PAGE, BAD);
    const file = join(tempDir(), 'summary.md');
    const result = await check([repo.root, '--format', 'github', '--summary', file], repo.root);
    expect(result.code).toBe(1);
    expect(result.out).toContain('::error file=');
    const text = readFileSync(file, 'utf8');
    expect(text).toMatch(/^The check found 1 error\.\n\n```\nerror unresolved-reference /u);
    expect(text).toContain(`${PAGE}:`);
  });

  it('writes an empty file, also over an old one, when there is no finding', async () => {
    const repo = gitProject();
    const file = join(tempDir(), 'summary.md');
    writeFileSync(file, 'The check found 9 errors.\n');
    const result = await check([repo.root, '--format', 'github', '--summary', file], repo.root);
    expect(result.code).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe('');
  });

  it('writes an empty file when no file is selected', async () => {
    const repo = gitProject();
    const file = join(tempDir(), 'summary.md');
    writeFileSync(file, 'old\n');
    const result = await check(
      [repo.root, '--staged', '--format', 'github', '--summary', file],
      repo.root,
    );
    expect(result.code).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe('');
  });
});

describe('check --summary, wrong use', () => {
  it.each(['text', 'json', 'sarif', 'gitlab'])(
    'refuses --format %s, with exit code 2',
    async format => {
      const repo = gitProject();
      const file = join(tempDir(), 'summary.md');
      const result = await check([repo.root, '--format', format, '--summary', file], repo.root);
      expect(result.code).toBe(2);
      expect(result.err).toContain('The option --summary works only with --format github.');
    },
  );
});

describe('check --summary, the file name', () => {
  it.each([
    [
      ['--summary', '2024'],
      'The option --summary needs a file name. For a file name that is a number, write it as ./<name>.',
    ],
    [
      ['--summary', 'a.md', '--summary', 'b.md'],
      'The option --summary was given more than once. Give it one time.',
    ],
  ])('refuses a value that is not a file name (%j), with exit code 2', async (args, text) => {
    const repo = gitProject();
    const result = await check([repo.root, '--format', 'github', ...args], repo.root);
    expect(result.code).toBe(2);
    expect(result.err).toContain(text);
  });

  it.each([
    ['a folder that does not exist', (dir: string): string => join(dir, 'nowhere', 'summary.md')],
    ['a folder', (dir: string): string => dir],
  ])('stops with exit code 2, before the annotations, for %s', async (_name, path) => {
    const repo = gitProject();
    repo.write(PAGE, BAD);
    const result = await check(
      [repo.root, '--format', 'github', '--summary', path(tempDir())],
      repo.root,
    );
    expect(result.code).toBe(2);
    expect(result.err).toContain('The summary file cannot be written:');
    expect(result.out).toBe('');
  });
});

describe('check --summary, errors', () => {
  it('refuses a summary file that is the baseline file, and keeps the baseline', async () => {
    const repo = gitProject();
    const baseline = join(repo.root, 'layerscope-baseline.json');
    writeFileSync(baseline, '{"entries":"keep"}\n');
    const result = await check(
      [repo.root, '--format', 'github', '--summary', 'layerscope-baseline.json'],
      repo.root,
    );
    expect(result.code).toBe(2);
    expect(result.err).toContain('--summary and the baseline name the same file.');
    expect(readFileSync(baseline, 'utf8')).toBe('{"entries":"keep"}\n');
  });
});

describe('check --summary, paths', () => {
  it('resolves the summary from the current directory and the baseline from the root', async () => {
    const repo = gitProject();
    const baseline = join(repo.root, 'layerscope-baseline.json');
    writeFileSync(baseline, '{"entries":"keep"}\n');
    const elsewhere = tempDir();
    const result = await check(
      [repo.root, '--format', 'github', '--summary', 'layerscope-baseline.json'],
      elsewhere,
    );
    expect(result.err).not.toContain('name the same file');
    expect(readFileSync(baseline, 'utf8')).toBe('{"entries":"keep"}\n');
    expect(readFileSync(join(elsewhere, 'layerscope-baseline.json'), 'utf8')).toBe('');
  });

  it('leaves no old list in the file when the check stops with an error later', async () => {
    const file = join(tempDir(), 'summary.md');
    writeFileSync(file, 'The check found 9 errors.\n');
    const result = await check(
      [join(tempDir(), 'no-such-root'), '--format', 'github', '--summary', file],
      process.cwd(),
    );
    expect(result.code).toBe(2);
    expect(readFileSync(file, 'utf8')).toBe('');
  });
});

describe('check --summary, other options', () => {
  it('refuses an empty file name, with exit code 2', async () => {
    const repo = gitProject();
    const result = await check([repo.root, '--format', 'github', '--summary', ''], repo.root);
    expect(result.code).toBe(2);
    expect(result.err).toContain('The option --summary needs a file name.');
  });

  it('refuses --update-baseline, with exit code 2', async () => {
    const repo = gitProject();
    const file = join(tempDir(), 'summary.md');
    const result = await check(
      [repo.root, '--format', 'github', '--update-baseline', '--summary', file],
      repo.root,
    );
    expect(result.code).toBe(2);
    expect(result.err).toContain('--update-baseline cannot be used with --summary.');
  });

  it('refuses --watch, with exit code 2', async () => {
    const repo = gitProject();
    const file = join(tempDir(), 'summary.md');
    const result = await check(
      [repo.root, '--format', 'github', '--watch', '--summary', file],
      repo.root,
    );
    expect(result.code).toBe(2);
    expect(result.err).toContain('--watch cannot be used with --summary.');
  });
});
