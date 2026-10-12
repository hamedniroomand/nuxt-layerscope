import { mkdirSync } from 'node:fs';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_ERROR, run } from '#src/cli.ts';
import { gitProject } from '#test/git-project.ts';

const FILE = 'layerscope-baseline.json';

afterEach(() => {
  vi.restoreAllMocks();
});

async function cli(args: string[]): Promise<{ code: number; err: string }> {
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const code = await run(['node', 'layerscope', ...args]);
  return { code, err: err.mock.calls.map(call => String(call[0])).join('') };
}

describe('the CLI', () => {
  it('exits 2 for drift when the baseline at the base ref is not JSON', async () => {
    const repo = gitProject();
    repo.write(FILE, '<<<<<<< HEAD\n');
    repo.commit('broken');
    const result = await cli(['drift', repo.root, '--base', 'HEAD']);
    expect(result.code).toBe(EXIT_ERROR);
    expect(result.err).toContain(`layerscope: ${FILE} at HEAD is not valid JSON`);
  });

  it('exits 2 for an empty baseline file in check, with the file name', async () => {
    const repo = gitProject();
    repo.write(FILE, '');
    const result = await cli(['check', repo.root]);
    expect(result.code).toBe(EXIT_ERROR);
    expect(result.err).toContain(`${join(repo.root, FILE)} is not valid JSON`);
  });

  it.each([
    ['check', []],
    ['check', ['--update-baseline']],
    ['fix', ['--dry-run']],
    ['drift', ['--base', 'HEAD']],
  ])('refuses --baseline "" for %s %j', async (command, extra) => {
    const repo = gitProject();
    const result = await cli([command, repo.root, ...extra, '--baseline', '']);
    expect(result.code).toBe(EXIT_ERROR);
    expect(result.err).toBe(
      `layerscope: --baseline needs a file name. Leave it out to use ${FILE}.\n`,
    );
  });

  it('refuses a directory as the baseline', async () => {
    const repo = gitProject();
    mkdirSync(join(repo.root, 'dir'));
    const result = await cli(['check', repo.root, '--baseline', 'dir']);
    expect(result.code).toBe(EXIT_ERROR);
    expect(result.err).toContain('is a directory, not a baseline file.');
  });
});

describe('the CLI, before it starts', () => {
  it.each([
    ['check', ['--watch']],
    ['mcp', []],
  ])('refuses --baseline "" for %s %j before it starts', async (command, extra) => {
    const repo = gitProject();
    const result = await cli([command, repo.root, ...extra, '--baseline', '']);
    expect(result.code).toBe(EXIT_ERROR);
    expect(result.err).toContain('layerscope: --baseline needs a file name.');
  });

  it('refuses a number', async () => {
    const repo = gitProject();
    const number = await cli(['check', repo.root, '--baseline', '2024']);
    expect(number.err).toContain('write it as ./<name>.');
  });

  it('refuses a repeated flag', async () => {
    const repo = gitProject();
    const twice = await cli(['check', repo.root, '--baseline', 'a.json', '--baseline', 'b.json']);
    expect(twice.code).toBe(EXIT_ERROR);
    expect(twice.err).toBe('layerscope: --baseline was given more than once. Give it one time.\n');
  });

  it('refuses a directory for --update-baseline, with the same text as a read', async () => {
    const repo = gitProject();
    mkdirSync(join(repo.root, 'dir'));
    const result = await cli(['check', repo.root, '--update-baseline', '--baseline', 'dir']);
    expect(result.code).toBe(EXIT_ERROR);
    expect(result.err).toBe(
      `layerscope: ${join(repo.root, 'dir')} is a directory, not a baseline file.\n`,
    );
  });
});
