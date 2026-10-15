import { rmSync } from 'node:fs';

import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { EXIT_CLEAN, EXIT_VIOLATIONS, run } from '#src/cli.ts';

import {
  FILE,
  commit,
  errorPage,
  findingsBaseline,
  repository,
  warningPage,
  writeBaseline,
} from './drift-project.ts';
import { page, write } from './fix-project.ts';
import { git } from './git-project.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const CART = 'layers/shop/app/pages/cart.vue';
const LINE = '✖ The code has 1 error that the baseline at main does not have (--fail-on-growth).';

async function drift(
  root: string,
  ...args: string[]
): Promise<{ code: number; out: string; err: string }> {
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const code = await run(['node', 'layerscope', 'drift', root, '--base', 'main', ...args]);
  return {
    code,
    out: out.mock.calls.map(call => String(call[0])).join(''),
    err: err.mock.calls.map(call => String(call[0])).join(''),
  };
}

/** Accepts the findings of the working tree in the baseline, and commits. */
async function accept(root: string, message: string): Promise<void> {
  writeBaseline(root, FILE, (await findingsBaseline(root)).entries);
  commit(root, message);
}

/** `main` with an empty baseline, and a branch `change` that adds an error and accepts it. */
async function grown(): Promise<string> {
  const root = repository();
  await accept(root, 'empty baseline');
  git(root, 'switch', '-q', '-c', 'change');
  write(root, CART, errorPage(false));
  await accept(root, 'add and accept');
  return root;
}

describe('drift --fail-on-growth', () => {
  it('fails when the change adds an error and accepts it in the baseline', async () => {
    const root = await grown();
    const result = await drift(root, '--fail-on-growth');
    expect(result.code).toBe(EXIT_VIOLATIONS);
    expect(result.out.trimEnd().split('\n').at(-1)).toBe(LINE);
  });

  it('passes without the option', async () => {
    const result = await drift(await grown());
    expect(result.code).toBe(EXIT_CLEAN);
    expect(result.out).not.toContain('--fail-on-growth');
  });

  it('ends the markdown report with the line and what to do', async () => {
    const result = await drift(await grown(), '--fail-on-growth', '--format', 'markdown');
    expect(result.code).toBe(EXIT_VIOLATIONS);
    expect(result.out).toContain(
      '\n\n**✖ The code has 1 error that the baseline at `main` does not have (--fail-on-growth).**\n\nIf this growth is intended, for example after a stricter config or a newer layerscope, a maintainer can merge the pull request without this check.\n',
    );
  });

  it('keeps the json report on stdout as it is, and says why on stderr', async () => {
    const result = await drift(await grown(), '--fail-on-growth', '--format', 'json');
    expect(result.code).toBe(EXIT_VIOLATIONS);
    expect((JSON.parse(result.out) as { adds: number }).adds).toBe(1);
    expect(result.err).toBe(`layerscope: ${LINE.slice(2)}\n`);
  });
});

describe('drift --fail-on-growth, what counts as growth', () => {
  it('fails when the change fixes one error and accepts another, so the size stays', async () => {
    const root = repository();
    write(root, CART, errorPage(false));
    await accept(root, 'accept the cart');
    git(root, 'switch', '-q', '-c', 'change');
    rmSync(join(root, CART));
    // Another error: the auto-import Cart of web, in a file that git does not pair with the cart.
    write(
      root,
      'layers/shop/app/pages/basket.vue',
      page('const items = [];', 'const total = 0;', 'Cart(items, total);'),
    );
    await accept(root, 'swap');
    const result = await drift(root, '--fail-on-growth');
    expect(result.out).toContain('adds 1, fixes 1');
    expect(result.out).toContain('Baseline: 1 → 1');
    expect(result.code).toBe(EXIT_VIOLATIONS);
  });

  it('passes when the change adds no error, also when it accepts a new warning', async () => {
    const root = repository();
    write(root, CART, errorPage(false));
    await accept(root, 'accept the cart');
    git(root, 'switch', '-q', '-c', 'change');
    write(root, 'layers/shop/app/pages/note.vue', warningPage(1));
    await accept(root, 'accept a warning');
    const result = await drift(root, '--fail-on-growth');
    expect(result.out).toContain('Baseline: 1 → 2');
    expect(result.code).toBe(EXIT_CLEAN);
  });

  it('fails when the base has no baseline file and the code has an error', async () => {
    const root = repository();
    git(root, 'switch', '-q', '-c', 'change');
    write(root, CART, errorPage(false));
    await accept(root, 'first baseline');
    expect((await drift(root, '--fail-on-growth')).code).toBe(EXIT_VIOLATIONS);
  });

  it('passes when the base has no baseline file and the code has no error', async () => {
    const root = repository();
    git(root, 'switch', '-q', '-c', 'change');
    write(root, 'layers/shop/app/pages/note.vue', warningPage(1));
    commit(root, 'a warning');
    expect((await drift(root, '--fail-on-growth')).code).toBe(EXIT_CLEAN);
  });
});
