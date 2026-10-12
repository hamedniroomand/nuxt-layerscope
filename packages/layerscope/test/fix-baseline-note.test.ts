import { readFileSync, writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, run } from '#src/cli.ts';

import { applyArgs, commitAll, silence } from './fix-apply-project.ts';
import { ADMIN, SHARED, SHOP, WEB, cartProject, checkArgs } from './fix-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const NOTE =
  '1 baseline entry names a moved file. After you make the moves, update this entry in the baseline file, or run `layerscope check --update-baseline` if you want to accept all current findings.';
const APPLIED = NOTE.replace('After you make the moves', 'After the move');

/** The cart project where the baseline accepts the finding of admin, but not the one of shop. */
async function projectWithBaseline(): Promise<string> {
  const root = cartProject([WEB, SHARED, ADMIN, SHOP]);
  silence();
  expect(await run([...checkArgs(root), '--update-baseline'])).toBe(EXIT_CLEAN);
  vi.restoreAllMocks();
  const file = join(root, 'layerscope-baseline.json');
  const baseline = JSON.parse(readFileSync(file, 'utf8')) as { entries: { file: string }[] };
  baseline.entries = baseline.entries.filter(entry => entry.file.includes('admin'));
  writeFileSync(file, JSON.stringify(baseline));
  return root;
}

describe('a baseline entry that names a moved file', () => {
  it('is counted in the note of --dry-run', async () => {
    const root = await projectWithBaseline();
    const output = silence();
    expect(await run(['node', 'layerscope', 'fix', root, '--dry-run'])).toBe(EXIT_CLEAN);
    expect(output.stdout()).toContain('useCart.ts →');
    expect(output.stdout()).toContain(NOTE);
  });

  it('is counted in the summary of --apply', async () => {
    const root = await projectWithBaseline();
    commitAll(root);
    const output = silence();
    expect(await run(applyArgs(root))).toBe(EXIT_CLEAN);
    expect(output.stdout()).toContain(APPLIED);
  });

  it('is not in the note when no accepted finding is in or at a moved file', async () => {
    const root = cartProject([WEB, SHARED, ADMIN, SHOP]);
    const output = silence();
    await run(['node', 'layerscope', 'fix', root, '--dry-run']);
    expect(output.stdout()).not.toContain('baseline entr');
  });
});
