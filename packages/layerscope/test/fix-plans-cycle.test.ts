import { writeFileSync } from 'node:fs';

import { join, relative } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { EXIT_CLEAN, EXIT_VIOLATIONS, run } from '#src/cli.ts';
import { planMoves } from '#src/fix/plan.ts';

import {
  ADMIN,
  SHARED,
  SHOP,
  WEB,
  applyPlan,
  cartProject,
  checkArgs,
  empty,
  page,
  plan,
  write,
} from './fix-project.ts';

const LAYERS = [WEB, SHARED, ADMIN, SHOP];

function silence(): void {
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('findings in the moved file', () => {
  /** useCart in web imports a file of shared, which web may not use: a finding in the moved file. */
  function importer(): string {
    const root = cartProject(LAYERS);
    write(
      root,
      'layers/web/app/composables/useCart.ts',
      "import { noop } from '../../../shared/app/utils/noop';\nexport const useCart = () => noop();\n",
    );
    return root;
  }

  it('counts them in "clears" and not as other findings', async () => {
    const root = importer();
    const result = await analyze({ rootDir: root });
    // Two uses of useCart, and its own import of shared.
    expect(result.findings).toHaveLength(3);
    const moves = planMoves(result);
    expect(moves).toHaveLength(1);
    expect(moves[0].fixes).toBe(3);
    silence();
    expect(await run(checkArgs(root))).toBe(EXIT_VIOLATIONS);
    await applyPlan(root);
    expect(await run(checkArgs(root))).toBe(EXIT_CLEAN);
  });

  it('prints no line about other findings', async () => {
    const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    await run(['node', 'layerscope', 'fix', importer(), '--dry-run']);
    const text = out.mock.calls.map(call => String(call[0])).join('');
    expect(text).toContain('clears 3 findings');
    expect(text).not.toContain('other finding');
  });
});

describe('a move that makes a layer cycle', () => {
  /** web uses shared, and shared may use web, so the file cannot go to shared. `rules` has no closing brace. */
  function cyclic(rules: string): string {
    const root = empty(
      `${[
        "web: { path: 'layers/web', allow: ['shared'] }",
        "shared: { path: 'layers/shared', allow: ['web'] }",
        ADMIN,
        SHOP,
      ].join(',\n')} }, ${rules} `,
    );
    write(root, 'layers/web/app/utils/secret.ts', 'export const secret = 1;\n');
    write(
      root,
      'layers/web/app/composables/useCart.ts',
      "import { secret } from '../utils/secret';\nexport const useCart = () => secret;\n",
    );
    write(
      root,
      'layers/web/app/pages/home.vue',
      page("import { useCart } from '../composables/useCart';", 'useCart();'),
    );
    write(root, 'layers/shared/app/utils/noop.ts', 'export const noop = 0;\n');
    for (const layer of ['admin', 'shop']) {
      write(
        root,
        `layers/${layer}/app/pages/p.vue`,
        page("import { useCart } from '../../../web/app/composables/useCart';", 'useCart();'),
      );
    }
    return root;
  }

  it('is not planned when the cycle rule is on', async () => {
    expect(await plan(cyclic("rules: { 'layer-cycle': 'error'"))).toEqual([]);
  });

  it('is planned when the cycle rule is off', async () => {
    expect(await plan(cyclic("rules: { 'layer-cycle': 'off'"))).toHaveLength(1);
  });
});

/** a and b use each other (a cycle in the baseline); x and y use useF, which is in a. */
function accepted(): string {
  const root = empty(
    `${[
      "a: { path: 'layers/a', allow: ['b'] }",
      "b: { path: 'layers/b', allow: ['a'] }",
      "s: { path: 'layers/s', allow: ['b'] }",
      "x: { path: 'layers/x', allow: ['s'] }",
      "y: { path: 'layers/y', allow: ['s'] }",
    ].join(',\n')} }, rules: { 'layer-cycle': 'error'`,
  );
  const bu = "import { bu } from '../../../b/app/utils/bu';";
  write(root, 'layers/a/app/composables/useF.ts', `${bu}\nexport const useF = () => bu;\n`);
  write(root, 'layers/a/app/utils/zz.ts', `${bu}\nexport const zz = () => bu;\n`);
  write(root, 'layers/a/app/utils/au.ts', 'export const au = 1;\n');
  write(
    root,
    'layers/b/app/utils/bu.ts',
    "import { au } from '../../../a/app/utils/au';\nexport const bu = au;\n",
  );
  write(root, 'layers/s/app/utils/keep.ts', 'export const keep = 1;\n');
  for (const layer of ['x', 'y']) {
    write(
      root,
      `layers/${layer}/app/pages/p.vue`,
      page("import { useF } from '../../../a/app/composables/useF';", 'useF();'),
    );
  }
  return root;
}

async function acceptCycles(root: string): Promise<void> {
  const before = await analyze({ rootDir: root });
  const entries = before.findings
    .filter(finding => finding.rule === 'layer-cycle')
    .map(({ rule, file, symbol, toLayer }) => ({
      rule,
      file: relative(root, file),
      symbol,
      toLayer,
    }));
  expect(entries.length).toBeGreaterThan(0);
  writeFileSync(join(root, 'b.json'), JSON.stringify({ version: 1, entries }));
}

describe('a move and a cycle that the baseline accepts', () => {
  it('does not plan a move that makes a cycle that check would show', async () => {
    const root = accepted();
    await acceptCycles(root);
    expect(await plan(root, 'b.json')).toEqual([]);
  });

  it('shows no new cycle in check --baseline after the plan is applied', async () => {
    const root = accepted();
    await acceptCycles(root);
    await applyPlan(root, 'b.json');
    const after = await analyze({ rootDir: root, baseline: 'b.json' });
    expect(after.findings.filter(finding => finding.rule === 'layer-cycle')).toEqual([]);
  });
});

/** a and b use each other in `m.ts`, which the baseline accepts; useX in o uses b. */
function shifting(): string {
  const root = empty(
    `${[
      "a: { path: 'layers/a', allow: ['b'] }",
      "b: { path: 'layers/b', allow: ['a'] }",
      "o: { path: 'layers/o', allow: ['a', 'b'] }",
      "x: { path: 'layers/x', allow: ['a'] }",
      "y: { path: 'layers/y', allow: ['a'] }",
    ].join(',\n')} }, rules: { 'layer-cycle': 'error'`,
  );
  const bu = "import { bu } from '../../../b/app/utils/bu';";
  write(root, 'layers/a/app/utils/m.ts', `${bu}\nexport const m = () => bu;\n`);
  write(root, 'layers/a/app/utils/au.ts', 'export const au = 1;\n');
  write(
    root,
    'layers/b/app/utils/bu.ts',
    "import { au } from '../../../a/app/utils/au';\nexport const bu = au;\n",
  );
  write(root, 'layers/o/app/composables/useX.ts', `${bu}\nexport const useX = () => bu;\n`);
  for (const layer of ['x', 'y']) {
    write(
      root,
      `layers/${layer}/app/pages/p.vue`,
      page("import { useX } from '../../../o/app/composables/useX';", 'useX();'),
    );
  }
  return root;
}

describe('a move that changes the file of a cycle', () => {
  it('is dropped when the cycle is accepted in another file and the move shows it', async () => {
    const root = shifting();
    await acceptCycles(root);
    // In `a`, useX.ts comes before m.ts, so the first edge of the cycle is in useX.ts.
    expect(await plan(root, 'b.json')).toEqual([]);
    await applyPlan(root, 'b.json');
    const after = await analyze({ rootDir: root, baseline: 'b.json' });
    expect(after.findings.filter(finding => finding.rule === 'layer-cycle')).toEqual([]);
  });

  it('is kept when the cycle is shown already and only its file changes', async () => {
    const root = accepted();
    // No baseline: the cycle a -> b -> a is shown before the move and after it.
    const moves = await plan(root);
    expect(moves.map(move => move.from)).toEqual([join(root, 'layers/a/app/composables/useF.ts')]);
    await applyPlan(root);
    const after = await analyze({ rootDir: root });
    expect(after.findings.filter(finding => finding.rule === 'layer-cycle')).toHaveLength(1);
  });
});

describe('moves that are fine together', () => {
  /**
   * a -> b and b -> s exist before any move. The move of A adds s -> b, which makes the cycle
   * s -> b -> s, and the move of B removes b -> s. So the moves are fine together. The move of A alone makes a cycle.
   */
  function pair(): string {
    const root = empty(
      `${[
        "a: { path: 'layers/a', allow: ['b'] }",
        "b: { path: 'layers/b', allow: ['s'] }",
        "s: { path: 'layers/s', allow: ['b'] }",
        "t: { path: 'layers/t', allow: ['s'] }",
        "u1: { path: 'layers/u1', allow: ['s', 't'] }",
        "u2: { path: 'layers/u2', allow: ['s', 't'] }",
      ].join(',\n')} }, rules: { 'layer-cycle': 'error'`,
    );
    write(root, 'layers/s/app/utils/sbase.ts', 'export const sbase = 1;\n');
    write(root, 'layers/b/app/utils/bb.ts', 'export const bb = 1;\n');
    write(
      root,
      'layers/a/app/utils/A.ts',
      "import { bb } from '../../../b/app/utils/bb';\nexport const A = bb;\n",
    );
    write(
      root,
      'layers/b/app/utils/B.ts',
      "import { sbase } from '../../../s/app/utils/sbase';\nexport const B = sbase;\n",
    );
    for (const layer of ['u1', 'u2']) {
      write(
        root,
        `layers/${layer}/app/utils/use.ts`,
        "import { A } from '../../../a/app/utils/A';\nimport { B } from '../../../b/app/utils/B';\nexport const use = [A, B];\n",
      );
    }
    return root;
  }

  it('keeps both moves when only the first one alone would make a cycle', async () => {
    const root = pair();
    const moves = await plan(root);
    expect(moves.map(move => move.to).toSorted()).toEqual([
      join(root, 'layers/s/app/utils/A.ts'),
      join(root, 'layers/s/app/utils/B.ts'),
    ]);
    await applyPlan(root);
    const after = await analyze({ rootDir: root });
    expect(after.findings.filter(finding => finding.rule === 'layer-cycle')).toEqual([]);
  });
});
