import { existsSync, readFileSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { baselineName } from '#src/baseline/index.ts';
import { EXIT_CLEAN, EXIT_ERROR, EXIT_VIOLATIONS } from '#src/cli.ts';
import type { LayerscopeConfig } from '#src/types.ts';

import { entries, KEY, keyProject, setKey } from './baseline-key-project.ts';
import { errorPage, FILE, repository } from './drift-project.ts';
import { write } from './fix-project.ts';
import { check } from './git-project.ts';

describe('the baseline key of the config, in check', () => {
  it('names the file that check --update-baseline writes and that check reads', async () => {
    const root = keyProject();
    expect((await check([root])).code).toBe(EXIT_VIOLATIONS);
    expect((await check([root, '--update-baseline'])).code).toBe(EXIT_CLEAN);
    expect(entries(root)).toBe(1);
    expect(existsSync(join(root, FILE))).toBe(false);
    expect((await check([root])).code).toBe(EXIT_CLEAN);
  });

  it('writes the file of the key again with --update-baseline', async () => {
    const root = keyProject();
    await check([root, '--update-baseline']);
    write(root, 'layers/shop/app/pages/b.vue', errorPage(false));
    await check([root, '--update-baseline']);
    expect(entries(root)).toBe(2);
  });

  it('is overridden by --baseline', async () => {
    const root = keyProject();
    await check([root, '--update-baseline']);
    expect((await check([root, '--baseline', 'other.json'])).code).toBe(EXIT_VIOLATIONS);
  });

  it('makes --summary refuse the baseline file of the config, and keeps that file', async () => {
    const root = keyProject();
    await check([root, '--update-baseline']);
    const before = readFileSync(join(root, KEY), 'utf8');
    const result = await check([root, '--format', 'github', '--summary', join(root, KEY)]);
    expect(result.code).toBe(EXIT_ERROR);
    expect(result.err).toContain('--summary and the baseline name the same file.');
    expect(readFileSync(join(root, KEY), 'utf8')).toBe(before);
  });
});

describe('the type of the baseline key', () => {
  it.each([
    ["''", '""'],
    ['1', '1'],
    ['[]', '[]'],
  ])('stops check for baseline: %s', async (value, shown) => {
    const root = repository();
    setKey(root, value);
    const result = await check([root]);
    expect(result.code).toBe(EXIT_ERROR);
    expect(result.err).toContain(
      `layerscope.config.mjs: baseline must be a non-empty file name, got ${shown}`,
    );
  });

  it('is checked for a config object, which skips the checks of a config file', () => {
    const config = { baseline: 1 } as unknown as LayerscopeConfig;
    expect(() => baselineName(undefined, config)).toThrow(
      'config: baseline must be a non-empty file name, got 1',
    );
  });
});
