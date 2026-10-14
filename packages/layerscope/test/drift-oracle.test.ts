import { rmSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { baselineSize, createBaseline } from '#src/baseline/index.ts';
import type { BaselineEntry } from '#src/types.ts';
import type { CheckErrors } from '#test/drift-project.ts';
import {
  checkErrors,
  commit,
  counts,
  drift,
  errorPage,
  FILE,
  repository,
  warningPage,
  writeBaseline,
} from '#test/drift-project.ts';
import { write } from '#test/fix-project.ts';
import { pick, randomFrom } from '#test/fix-random-project.ts';
import type { Random } from '#test/fix-random-project.ts';
import { git } from '#test/git-project.ts';

type Kind = 'error' | 'twice' | 'warning';

/** Two to five shop pages at random: errors, duplicate errors and warnings. Gives their kinds. */
function writePages(root: string, random: Random, from: number): Kind[] {
  const count = 2 + Math.floor(random() * 4);
  const kinds: Kind[] = [];
  for (let index = from; index < from + count; index += 1) {
    const kind = pick<Kind>(random, ['error', 'twice', 'warning', 'warning']);
    const text = kind === 'warning' ? warningPage(index) : errorPage(kind === 'twice');
    write(root, `layers/shop/app/pages/s${index}.vue`, text);
    kinds.push(kind);
  }
  return kinds;
}

/** Some of the entries, and some counts made smaller. */
function someOf(entries: BaselineEntry[], random: Random): BaselineEntry[] {
  return entries.flatMap(entry => {
    if (random() < 0.4) {
      return [];
    }
    return (entry.count ?? 1) > 1 && random() < 0.5 ? [{ ...entry, count: 1 }] : [entry];
  });
}

type Change = 'none' | 'add' | 'remove';

/** Removes all pages, or adds pages with at least one error, or makes no change. */
function changeBranch(root: string, random: Random, change: Change): void {
  if (change === 'add') {
    write(root, 'layers/shop/app/pages/added.vue', errorPage(true));
    writePages(root, random, 100);
  }
  if (change === 'remove') {
    rmSync(join(root, 'layers/shop/app/pages'), { recursive: true, force: true });
  }
}

interface Branch {
  root: string;
  base: BaselineEntry[];
  atBase: CheckErrors;
}

const CONFIGS = ['', "'unresolved-reference': 'error'"];

interface Case {
  seed: number;
  rules: string;
  change: Change;
  keepErrors?: boolean;
}

/**
 * A base on `main` with random pages, and the branch `pr` with `change`. With `keepErrors`, the
 * base baseline has all the errors of the base and some of its warnings, so check passes there.
 */
async function randomBranch({ seed, rules, change, keepErrors = false }: Case): Promise<Branch> {
  const random = randomFrom(seed);
  // The first number of the generator is very small for a small seed, so do not use it.
  random();
  const root = repository(rules);
  const kinds = writePages(root, random, 0);
  // A seed that gives no error page or no warning page does not test the mix: change the seed.
  expect(kinds).toContain('warning');
  expect(kinds.some(kind => kind !== 'warning')).toBe(true);
  const { findings } = await analyze({ rootDir: root });
  const errors = findings.filter(finding => finding.severity === 'error');
  const warnings = findings.filter(finding => finding.severity === 'warn');
  const base = keepErrors
    ? [
        ...createBaseline(errors, root).entries,
        ...someOf(createBaseline(warnings, root).entries, random),
      ]
    : someOf(createBaseline(findings, root).entries, random);
  writeBaseline(root, FILE, base);
  commit(root, 'base');
  const atBase = await checkErrors(root, base);
  git(root, 'checkout', '-q', '-b', 'pr');
  changeBranch(root, random, change);
  commit(root, 'pr');
  return { root, base, atBase };
}

const SEEDS = [5, 11, 29, 47, 83, 7];
const CHANGES: Change[] = ['none', 'add', 'remove'];
const CASES = CONFIGS.flatMap(rules =>
  SEEDS.map((seed, index) => ({ seed, rules, change: CHANGES[index % CHANGES.length] })),
);

describe('drift, the oracle: the errors that check finds against the base baseline', () => {
  it.each(CASES)('adds what check reports, seed $seed, rules "$rules", $change', async item => {
    const { change } = item;
    const { root, base, atBase } = await randomBranch(item);
    const result = await drift(root);
    expect(baselineSize(result.added)).toBe((await checkErrors(root, base)).open);
    // Only the change 'remove' takes away findings of the base.
    expect(baselineSize(result.fixed)).toBe(change === 'remove' ? atBase.accepted : 0);
  });

  it.each(CASES)(
    'adds 0 and fixes 0 with no change when check passes on the base, seed $seed, rules "$rules"',
    async item => {
      const { root, atBase } = await randomBranch({ ...item, change: 'none', keepErrors: true });
      expect(atBase.open).toBe(0);
      expect(counts(await drift(root))).toEqual([0, 0]);
    },
  );
});
