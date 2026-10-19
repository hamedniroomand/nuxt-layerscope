import { mkdtempSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { EXIT_CLEAN, EXIT_ERROR, EXIT_VIOLATIONS } from '#src/cli.ts';
import { updateCommand } from '#src/commands/check-strict.ts';
import { check, gitProject } from '#test/git-project.ts';

const FILE = 'my baseline.json';
const COMMAND = `layerscope check --baseline '${FILE}' --update-baseline`;
const STALE = {
  rule: 'unresolved-reference',
  file: 'layers/a/app/pages/gone.vue',
  symbol: './x',
  toLayer: null,
};

/** A committed project whose baseline has one fixed entry; the pages of the project have no finding. */
function staleProject(): string {
  const repo = gitProject();
  repo.write(FILE, `${JSON.stringify({ version: 1, entries: [STALE] }, null, 2)}\n`);
  return repo.root;
}

describe('the text report with only fixed baseline entries', () => {
  it('has no ✔ line under --strict-baseline, and both hints give the same command', async () => {
    const result = await check(['--baseline', FILE, '--strict-baseline'], staleProject());
    expect(result.code).toBe(EXIT_VIOLATIONS);
    expect(result.out).toContain(`${FILE}: 1 fixed entry. Run "${COMMAND}" to remove it.`);
    expect(result.out).toContain(`Run "${COMMAND}" and commit ${FILE}.`);
    expect(result.out).toContain('\n\nNo new problems in ');
    expect(result.out).not.toContain('✔');
  });

  it('keeps the ✔ line without --strict-baseline', async () => {
    const result = await check(['--baseline', FILE], staleProject());
    expect(result.code).toBe(EXIT_CLEAN);
    expect(result.out).toContain(`Run "${COMMAND}" to remove it.`);
    expect(result.out).toContain('✔ No problems in ');
  });

  it('gives the same command in the github annotation', async () => {
    const result = await check(['--baseline', FILE, '--format', 'github'], staleProject());
    expect(result.out).toContain(`Run "${COMMAND}" to remove it.`);
  });
});

describe('the update command with a value that starts with -', () => {
  it('writes the value after =, so the parser does not read it as a flag', () => {
    expect(updateCommand(undefined, { config: '-c.ts', baseline: '-b.json' })).toBe(
      'layerscope check --config=-c.ts --baseline=-b.json --update-baseline',
    );
    expect(updateCommand(undefined, { config: '-c d.ts' })).toBe(
      "layerscope check --config='-c d.ts' --update-baseline",
    );
  });
});

describe('the update command with a root that starts with -', () => {
  it('writes ./ before the root, and the command runs', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-dash-')));
    symlinkSync(staleProject(), join(dir, '-app'));
    const args = ['--baseline', FILE, '--strict-baseline', '--', '-app'];
    const failed = await check(args, dir);
    expect(failed.code).toBe(EXIT_VIOLATIONS);
    expect(failed.out).toContain(
      `Run "layerscope check ./-app --baseline '${FILE}' --update-baseline"`,
    );
    expect((await check(['./-app', '--baseline', FILE, '--update-baseline'], dir)).code).toBe(
      EXIT_CLEAN,
    );
    expect((await check(args, dir)).code).toBe(EXIT_CLEAN);
  });
});

describe('the update command with a source that is not a word', () => {
  it('leaves the error to the check of --source', async () => {
    const result = await check(['--source', '1', '--strict-baseline'], staleProject());
    expect(result.code).toBe(EXIT_ERROR);
    expect(result.err).toContain('Unknown source');
  });
});
