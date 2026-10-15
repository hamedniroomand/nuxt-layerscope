import { writeFileSync } from 'node:fs';

import { join } from 'pathe';
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

/** Declares `useCart` as an auto-import from the file, as Nuxt does in `.nuxt`. */
function declareCart(root: string, path: string): void {
  write(
    root,
    '.nuxt/types/imports.d.ts',
    `export {}\ndeclare global {\n  const useCart: typeof import('../../${path.replace('.ts', '')}').useCart\n}\n`,
  );
}

/** A project where admin and shop use `useCart` as an auto-import from web. */
function autoImportProject(path: string, layers = LAYERS): string {
  const root = cartProject(layers);
  write(root, 'layers/web/app/composables/useCart.ts', '');
  write(root, path, 'export const useCart = () => 1;\n');
  declareCart(root, path);
  write(root, 'layers/admin/app/pages/admin.vue', page('useCart();'));
  write(root, 'layers/shop/app/pages/shop.vue', page('useCart();'));
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** price and useCart both move, and useCart imports price. */
function pair(): string {
  const root = empty(
    [
      "web: { path: 'layers/web', allow: ['shared', 'common'] }",
      SHARED,
      "common: { path: 'layers/common', allow: ['web'] }",
      "admin: { path: 'layers/admin', allow: ['shared', 'common'] }",
      "shop: { path: 'layers/shop', allow: ['shared', 'common'] }",
    ].join(',\n'),
  );
  write(root, 'layers/shared/app/utils/noop.ts', 'export const noop = 0;\n');
  write(root, 'layers/common/app/utils/noop2.ts', 'export const noop2 = 0;\n');
  write(root, 'layers/web/app/utils/price.ts', 'export const price = () => 2;\n');
  write(
    root,
    'layers/web/app/utils/useCart.ts',
    "import { price } from './price';\nexport const useCart = () => price();\n",
  );
  for (const layer of ['admin', 'shop']) {
    write(
      root,
      `layers/${layer}/app/pages/p.vue`,
      page(
        "import { price } from '../../../web/app/utils/price';",
        "import { useCart } from '../../../web/app/utils/useCart';",
        'useCart(); price();',
      ),
    );
  }
  return root;
}

describe('moves that are planned together', () => {
  it('drops the move that would break check when the other one is done', async () => {
    const root = pair();
    silence();
    const before = await analyze({ rootDir: root });
    const moves = planMoves(before);
    // Both files fit alone. Together, `useCart` in common would use `price` in shared, which
    // common may not use. Only one of the two moves stays.
    expect(moves.map(move => move.from)).toEqual([join(root, 'layers/web/app/utils/price.ts')]);
    // The findings of the dropped move have a suggestion that is not a move.
    const dropped = before.findings.filter(finding => finding.symbol.endsWith('/useCart'));
    expect(dropped).toHaveLength(2);
    expect(dropped.map(finding => finding.suggestion?.action)).not.toContain('move');
    await applyPlan(root);
    const after = await analyze({ rootDir: root });
    // No finding is new: each one points at the file that did not move.
    expect(after.findings.length).toBeGreaterThan(0);
    for (const finding of after.findings) {
      expect(finding.target).toBe(join(root, 'layers/web/app/utils/useCart.ts'));
    }
  });

  it('gives the move the count of imports that its plan lists', async () => {
    const root = pair();
    const result = await analyze({ rootDir: root });
    const moves = planMoves(result);
    for (const finding of result.findings) {
      if (finding.suggestion?.action === 'move') {
        const move = moves.find(candidate => candidate.from === finding.target);
        expect(finding.suggestion.impact.imports).toBe(move?.updates.length);
        expect(finding.suggestion.message).toContain(`${move?.updates.length} imports to update`);
      }
    }
    expect(moves.flatMap(move => move.updates).length).toBeGreaterThan(0);
  });
});

describe('where Nuxt scans', () => {
  it('does not move a file that `#imports` gives, outside the dirs that Nuxt scans', async () => {
    const root = cartProject(LAYERS);
    write(root, 'layers/web/app/stores/cart.ts', 'export const useCart = () => 1;\n');
    declareCart(root, 'layers/web/app/stores/cart.ts');
    const importer = page("import { useCart } from '#imports';", 'useCart();');
    write(root, 'layers/admin/app/pages/admin.vue', importer);
    write(root, 'layers/shop/app/pages/shop.vue', importer);
    expect(await plan(root)).toEqual([]);
  });

  it('does not move a file that sits deeper than Nuxt reads', async () => {
    const root = autoImportProject('layers/web/app/composables/cart/useCart.ts');
    expect(await plan(root)).toEqual([]);
  });

  it('moves the index file of a sub dir, which Nuxt reads', async () => {
    const root = autoImportProject('layers/web/app/composables/cart/index.ts');
    const [move] = await plan(root);
    expect(move.to).toBe(join(root, 'layers/shared/app/composables/cart/index.ts'));
  });
});

describe('a move of an auto-import or a component, applied', () => {
  it('passes check after the planned move of an auto-imported file', async () => {
    const root = autoImportProject('layers/web/app/composables/useCart.ts');
    silence();
    expect(await run(checkArgs(root))).toBe(EXIT_VIOLATIONS);
    await applyPlan(root);
    expect(await run(checkArgs(root))).toBe(EXIT_CLEAN);
  });

  it('passes check after the planned move of a component', async () => {
    const root = cartProject(LAYERS);
    write(root, 'layers/web/app/components/BaseButton.vue', '<template><button /></template>\n');
    write(
      root,
      '.nuxt/components.d.ts',
      `export {}\nexport const BaseButton: typeof import("../layers/web/app/components/BaseButton.vue")['default']\n`,
    );
    const template = '<template><BaseButton /></template>\n';
    write(root, 'layers/admin/app/pages/admin.vue', template);
    write(root, 'layers/shop/app/pages/shop.vue', template);
    silence();
    expect(await run(checkArgs(root))).toBe(EXIT_VIOLATIONS);
    const [move] = await plan(root);
    expect(move.to).toBe(join(root, 'layers/shared/app/components/BaseButton.vue'));
    await applyPlan(root);
    expect(await run(checkArgs(root))).toBe(EXIT_CLEAN);
  });
});

describe('a name that the target has already', () => {
  it('does not move a component into a layer with a component of the same name', async () => {
    const root = cartProject(LAYERS);
    write(root, 'layers/web/app/components/BaseButton.vue', '<template><button /></template>\n');
    // `base/Button.vue` is the component BaseButton too.
    write(
      root,
      '.nuxt/components.d.ts',
      `export {}\nexport const BaseButton: typeof import("../layers/web/app/components/BaseButton.vue")['default']\n`,
    );
    const template = '<template><BaseButton /></template>\n';
    write(root, 'layers/admin/app/pages/admin.vue', template);
    write(root, 'layers/shop/app/pages/shop.vue', template);
    expect(await plan(root)).toHaveLength(1);
    write(root, 'layers/shared/app/components/base/Button.vue', '<template><b /></template>\n');
    expect(await plan(root)).toEqual([]);
  });

  it('does not move an auto-import into a layer that exports the name in another file', async () => {
    const root = autoImportProject('layers/web/app/composables/useCart.ts');
    expect(await plan(root)).toHaveLength(1);
    write(root, 'layers/shared/app/composables/cart.ts', 'export const useCart = () => 2;\n');
    expect(await plan(root)).toEqual([]);
  });

  it.each([
    'export type useCart = () => number;',
    'export interface useCart { (): number }',
    "export * as useCart from './inner';",
    "export * from './inner';",
  ])('does not move an auto-import into a layer with "%s"', async exported => {
    const root = autoImportProject('layers/web/app/composables/useCart.ts');
    expect(await plan(root)).toHaveLength(1);
    write(root, 'layers/shared/app/composables/cart.ts', `${exported}\n`);
    expect(await plan(root)).toEqual([]);
  });
});

describe('a moved file with `export * from`', () => {
  // The moved file re-exports from the target, which it may use, so only the names stop the move.
  const REEXPORT = "export * from '../../../shared/app/utils/noop';\n";

  it('does not move a file with `export * from` into a layer with any auto-import', async () => {
    const root = autoImportProject('layers/web/app/composables/useCart.ts');
    write(root, 'layers/web/app/composables/useCart.ts', REEXPORT);
    expect(await plan(root)).toEqual([]);
  });

  it('does not move a file with `export * from` into a layer whose names are not read', async () => {
    const root = autoImportProject('layers/web/app/composables/useCart.ts');
    write(root, 'layers/web/app/composables/useCart.ts', REEXPORT);
    write(root, 'layers/shared/app/utils/noop.ts', "export * from './other';\n");
    expect(await plan(root)).toEqual([]);
  });
});

describe('the baseline', () => {
  it('counts only the findings that check shows in "clears"', async () => {
    const root = cartProject(LAYERS);
    const entry = {
      rule: 'layer-boundary',
      file: 'layers/admin/app/pages/admin.vue',
      symbol: '../../../web/app/composables/useCart',
      toLayer: 'web',
    };
    writeFileSync(
      join(root, 'layerscope-baseline.json'),
      JSON.stringify({ version: 1, entries: [entry] }),
    );
    const result = await analyze({ rootDir: root, baseline: 'layerscope-baseline.json' });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.suggestion?.action).toBe('move');
    expect(result.findings[0]?.suggestion?.impact.fixes).toBe(1);
    expect(result.findings[0]?.suggestion?.message).toContain('clears 1 finding)');
  });
});

describe('the line about other findings', () => {
  async function fix(root: string): Promise<string> {
    const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    await run(['node', 'layerscope', 'fix', root, '--dry-run']);
    return out.mock.calls.map(call => String(call[0])).join('');
  }

  it('does not count a finding that a planned move clears', async () => {
    // shop may use web, so its use is an internal finding, and the move clears it too.
    const root = cartProject([
      "web: { path: 'layers/web', allow: [], expose: [] }",
      SHARED,
      ADMIN,
      "shop: { path: 'layers/shop', allow: ['shared', 'web'] }",
    ]);
    const text = await fix(root);
    expect(text).toContain('layers/web/app/composables/useCart.ts');
    expect(text).not.toContain('other finding');
  });

  it('counts the findings of every rule that no move clears', async () => {
    const root = cartProject(LAYERS);
    write(root, 'layers/admin/app/pages/other.vue', page('useMissing();'));
    expect(await fix(root)).toContain(
      '1 other finding has no file move. Run `layerscope check` to see them.',
    );
  });
});
