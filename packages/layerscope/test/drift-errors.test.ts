import { rmSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import type { BaselineEntry } from '#src/types.ts';
import {
  checkErrors,
  commit,
  counts,
  drift,
  errorPage,
  FILE,
  findingsBaseline,
  repository,
  setRules,
  warningPage,
  writeBaseline,
} from '#test/drift-project.ts';
import { write } from '#test/fix-project.ts';
import { check, git } from '#test/git-project.ts';

describe('drift, a branch with no change', () => {
  it('adds 0 for a warning on the base that the base baseline does not have', async () => {
    const root = repository();
    write(root, 'layers/shop/app/pages/s0.vue', warningPage(0));
    writeBaseline(root, FILE, []);
    commit(root, 'base');
    git(root, 'checkout', '-q', '-b', 'pr');
    const result = await drift(root);
    expect(counts(result)).toEqual([0, 0]);
    expect(result.baselineSize).toEqual({ base: 0, current: 0 });
  });

  it('adds 0 when the base baseline has a duplicate error with its count', async () => {
    const root = repository();
    write(root, 'layers/shop/app/pages/s0.vue', errorPage(true));
    const base = (await findingsBaseline(root)).entries;
    expect(base).toEqual([expect.objectContaining({ rule: 'layer-boundary', count: 2 })]);
    writeBaseline(root, FILE, base);
    commit(root, 'base');
    git(root, 'checkout', '-q', '-b', 'pr');
    expect(counts(await drift(root))).toEqual([0, 0]);
  });
});

describe('drift, a duplicate error', () => {
  it('adds 1 when the base baseline accepts only one of two', async () => {
    const root = repository();
    write(root, 'layers/shop/app/pages/s0.vue', errorPage(true));
    const [entry] = (await findingsBaseline(root)).entries;
    expect(entry.count).toBe(2);
    writeBaseline(root, FILE, [{ ...entry, count: 1 }]);
    commit(root, 'base');
    git(root, 'checkout', '-q', '-b', 'pr');
    const result = await drift(root);
    expect(result.added).toEqual([{ ...entry, count: 1 }]);
    expect(counts(result)).toEqual([1, 0]);
  });
});

describe('drift, a rule that is not set to error at the head', () => {
  const CYCLE = { rule: 'layer-cycle', file: 'x.ts', symbol: 'web → shop → web', toLayer: 'shop' };

  it('does not count the base entries of a rule set to off as fixed', async () => {
    const root = repository();
    writeBaseline(root, FILE, [CYCLE as BaselineEntry]);
    commit(root, 'base');
    git(root, 'checkout', '-q', '-b', 'pr');
    const result = await drift(root);
    expect(counts(result)).toEqual([0, 0]);
    expect(result.baselineSize).toEqual({ base: 1, current: 1 });
  });

  it('does not count base entries as fixed when the change sets the rule to warn', async () => {
    const root = repository();
    write(root, 'layers/shop/app/pages/s0.vue', errorPage(false));
    writeBaseline(root, FILE, (await findingsBaseline(root)).entries);
    commit(root, 'base');
    git(root, 'checkout', '-q', '-b', 'pr');
    setRules(root, "'layer-boundary': 'warn'");
    rmSync(join(root, 'layers/shop/app/pages/s0.vue'));
    commit(root, 'warn');
    expect(counts(await drift(root))).toEqual([0, 0]);
  });
});

describe('drift, a change that sets a rule from warn to error', () => {
  it('adds the base warnings that the base baseline does not have', async () => {
    const root = repository();
    write(root, 'layers/shop/app/pages/s0.vue', warningPage(0));
    write(root, 'layers/shop/app/pages/s1.vue', warningPage(1));
    const entries = (await findingsBaseline(root)).entries;
    const kept = entries.filter(entry => entry.file.endsWith('s1.vue'));
    writeBaseline(root, FILE, kept);
    commit(root, 'base');
    git(root, 'checkout', '-q', '-b', 'pr');
    setRules(root, "'unresolved-reference': 'error'");
    commit(root, 'error');
    const result = await drift(root);
    const warning = entries.find(entry => entry.file.endsWith('s0.vue'));
    expect(result.added).toEqual([{ ...warning, count: 1 }]);
    expect(counts(result)).toEqual([1, 0]);
    expect((await checkErrors(root, kept)).open).toBe(1);
  });
});

describe('drift, limits that need an analysis of the base', () => {
  it('counts a stale base entry as fixed on a branch with no change', async () => {
    const root = repository();
    write(root, 'layers/shop/app/pages/s0.vue', errorPage(false));
    writeBaseline(root, FILE, (await findingsBaseline(root)).entries);
    commit(root, 'base');
    // The base fixes the error and keeps the entry: check passes there.
    rmSync(join(root, 'layers/shop/app/pages/s0.vue'));
    commit(root, 'fix without --update-baseline');
    expect((await check([root])).code).toBe(0);
    git(root, 'checkout', '-q', '-b', 'pr');
    expect(counts(await drift(root))).toEqual([0, 1]);
  });
});

describe('drift, a rule that the current config sets to warn', () => {
  it('adds 0 for a new layer-boundary finding, and check passes too', async () => {
    const root = repository("'layer-boundary': 'warn'");
    writeBaseline(root, FILE, []);
    commit(root, 'base');
    git(root, 'checkout', '-q', '-b', 'pr');
    write(root, 'layers/shop/app/pages/s0.vue', errorPage(false));
    commit(root, 'pr');
    expect(counts(await drift(root))).toEqual([0, 0]);
    const result = await check([root, '--format', 'json']);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toMatchObject({
      findings: [{ rule: 'layer-boundary', severity: 'warn' }],
    });
  });
});
