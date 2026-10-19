import { existsSync, writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, EXIT_ERROR, run } from '#src/cli.ts';
import { gitProject } from '#test/git-project.ts';

import { init, project, removeProjects } from './init-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
  removeProjects();
});

async function cli(args: string[]): Promise<{ code: number; err: string }> {
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const code = await run(['node', 'layerscope', ...args]);
  return { code, err: err.mock.calls.map(call => String(call[0])).join('') };
}

describe('the folder of the baseline file', () => {
  it('is made by check --update-baseline when it does not exist', async () => {
    const repo = gitProject();
    const result = await cli(['check', repo.root, '--update-baseline', '--baseline', 'ci/b.json']);
    expect(result.code).toBe(EXIT_CLEAN);
    expect(existsSync(join(repo.root, 'ci/b.json'))).toBe(true);
  });

  it('is made by init --baseline when it does not exist', async () => {
    const root = project({
      files: [['layerscope.config.mjs', "export default { baseline: 'ci/base.json' };\n"]],
    });
    expect((await init(root, '--force', '--baseline')).code).toBe(EXIT_CLEAN);
    expect(existsSync(join(root, 'ci/base.json'))).toBe(true);
  });

  it('stops with the file name and the error code when a file is in place of the folder', async () => {
    const repo = gitProject();
    writeFileSync(join(repo.root, 'ci'), '');
    const result = await cli(['check', repo.root, '--update-baseline', '--baseline', 'ci/b.json']);
    expect(result.code).toBe(EXIT_ERROR);
    expect(result.err).toContain(`layerscope: Cannot write ${join(repo.root, 'ci/b.json')} (E`);
    expect(result.err).toMatch(/ \(E[A-Z]+\)\.\n/u);
  });
});
