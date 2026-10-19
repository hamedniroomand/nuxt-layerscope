import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { EXIT_CLEAN, EXIT_VIOLATIONS, run } from '#src/cli.ts';

import {
  ADMIN,
  CART,
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('move targets', () => {
  it('moves to a layer that exposes the symbol, and the plan passes check', async () => {
    const root = cartProject([
      WEB,
      "shared: { path: 'layers/shared', allow: [], expose: ['**'] }",
      ADMIN,
      SHOP,
    ]);
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    expect(await run(checkArgs(root))).toBe(EXIT_VIOLATIONS);
    const [move] = await plan(root);
    expect(move.to).toBe(join(root, 'layers/shared/app/composables/useCart.ts'));
    await applyPlan(root);
    expect(await run(checkArgs(root))).toBe(EXIT_CLEAN);
  });

  it('does not move to a layer that does not expose the symbol', async () => {
    const root = cartProject([
      WEB,
      "shared: { path: 'layers/shared', allow: [], expose: ['noop'] }",
      ADMIN,
      SHOP,
    ]);
    expect(await plan(root)).toEqual([]);
  });
});

describe('move targets: users and dependencies', () => {
  it('checks the users in the owner layer too', async () => {
    const root = cartProject([WEB, SHARED, ADMIN, SHOP]);
    write(
      root,
      'layers/web/app/pages/home.vue',
      page("import { useCart } from '../composables/useCart';", 'useCart();'),
    );
    // web may not use shared, so the move would break the page in web itself.
    expect(await plan(root)).toEqual([]);
    const allowed = cartProject([
      "web: { path: 'layers/web', allow: ['shared'] }",
      SHARED,
      ADMIN,
      SHOP,
    ]);
    write(
      allowed,
      'layers/web/app/pages/home.vue',
      page("import { useCart } from '../composables/useCart';", 'useCart();'),
    );
    expect(await plan(allowed)).toHaveLength(1);
  });

  it('does not move a file that uses an internal symbol of its owner layer', async () => {
    const root = cartProject([
      "web: { path: 'layers/web', allow: [], expose: ['useCart'] }",
      "shared: { path: 'layers/shared', allow: ['web'] }",
      ADMIN,
      SHOP,
    ]);
    write(root, 'layers/web/app/composables/secret.ts', 'export const secret = 1;\n');
    write(root, CART, "import { secret } from './secret';\nexport const useCart = () => secret;\n");
    expect(await plan(root)).toEqual([]);
  });
});

describe('move targets: destinations', () => {
  it('does not move onto a file that exists', async () => {
    const root = cartProject([WEB, SHARED, ADMIN, SHOP]);
    write(root, 'layers/shared/app/composables/useCart.ts', 'export const other = 1;\n');
    expect(await plan(root)).toEqual([]);
  });

  it('plans one move for two files that would land on the same path', async () => {
    const root = cartProject([
      WEB,
      "store: { path: 'layers/store', allow: [] }",
      SHARED,
      ADMIN,
      SHOP,
    ]);
    // Another name, so the two files do not conflict as auto-imports.
    write(
      root,
      'layers/store/app/composables/useCart.ts',
      'export const useStoreCart = () => 2;\n',
    );
    write(
      root,
      'layers/admin/app/pages/store.vue',
      page(
        "import { useStoreCart as other } from '../../../store/app/composables/useCart';",
        'other();',
      ),
    );
    write(
      root,
      'layers/shop/app/pages/store.vue',
      page(
        "import { useStoreCart as other } from '../../../store/app/composables/useCart';",
        'other();',
      ),
    );
    const moves = await plan(root);
    expect(moves).toHaveLength(1);
    // The first finding in report order claims the path: the file of web.
    expect(moves[0].from).toBe(join(root, 'layers/web/app/composables/useCart.ts'));
    expect(moves[0].to).toBe(join(root, 'layers/shared/app/composables/useCart.ts'));
    // The other file gets the suggestion that is not a move.
    const result = await analyze({ rootDir: root });
    const store = result.findings.filter(finding => finding.target?.includes('/store/') === true);
    expect(store.length).toBeGreaterThan(0);
    expect(store.map(finding => finding.suggestion?.action)).toEqual(store.map(() => 'allow'));
  });
});

describe('move targets: taken destinations', () => {
  it('falls back to the next target when the first one is taken', async () => {
    const root = cartProject([
      WEB,
      "store: { path: 'layers/store', allow: [] }",
      SHARED,
      "common: { path: 'layers/common', allow: [] }",
      "admin: { path: 'layers/admin', allow: ['shared', 'common'] }",
      "shop: { path: 'layers/shop', allow: ['shared', 'common'] }",
    ]);
    write(root, 'layers/common/app/utils/noop.ts', 'export const noop = () => 0;\n');
    // Another name, so the two files do not conflict as auto-imports.
    write(
      root,
      'layers/store/app/composables/useCart.ts',
      'export const useStoreCart = () => 2;\n',
    );
    write(
      root,
      'layers/admin/app/pages/store.vue',
      page(
        "import { useStoreCart as other } from '../../../store/app/composables/useCart';",
        'other();',
      ),
    );
    write(
      root,
      'layers/shop/app/pages/store.vue',
      page(
        "import { useStoreCart as other } from '../../../store/app/composables/useCart';",
        'other();',
      ),
    );
    const moves = await plan(root);
    expect(moves.map(move => move.layer).toSorted()).toEqual(['common', 'shared']);
  });
});

describe('move targets: root and source dirs', () => {
  it('uses root as a target when it is the only layer that fits', async () => {
    const root = empty(
      [
        "feature: { path: 'layers/feature', allow: [] }",
        "other: { path: 'layers/other', allow: ['root'] }",
        'root: { allow: [] }',
      ].join(',\n'),
    );
    write(
      root,
      'app/pages/index.vue',
      page("import { useThing } from '../../layers/feature/app/utils/thing';"),
    );
    write(root, 'layers/feature/app/utils/thing.ts', 'export const useThing = () => 1;\n');
    write(
      root,
      'layers/other/app/pages/other.vue',
      page("import { useThing } from '../../../feature/app/utils/thing';", 'useThing();'),
    );
    const [move] = await plan(root);
    // Root has its own `app/` dir, so the file lands there.
    expect(move.to).toBe(join(root, 'app/utils/thing.ts'));
    await applyPlan(root);
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    expect(await run(checkArgs(root))).toBe(EXIT_CLEAN);
  });
});

describe('move targets: source dirs', () => {
  it('puts the file in the source dir of the target layer', async () => {
    const root = cartProject([WEB, SHARED, ADMIN, SHOP]);
    // `common` has no app/ dir, so its source dir is its root.
    const flat = cartProject([
      WEB,
      "plain: { path: 'layers/plain', allow: [] }",
      "admin: { path: 'layers/admin', allow: ['plain'] }",
      "shop: { path: 'layers/shop', allow: ['plain'] }",
    ]);
    write(flat, 'layers/plain/nuxt.config.ts', 'export default {};\n');
    write(flat, 'layers/plain/utils/noop.ts', 'export const noop = () => 0;\n');
    const [move] = await plan(flat);
    expect(move.to).toBe(join(flat, 'layers/plain/composables/useCart.ts'));
    await applyPlan(flat);
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    expect(await run(checkArgs(flat))).toBe(EXIT_CLEAN);
    expect((await plan(root))[0].to).toBe(join(root, 'layers/shared/app/composables/useCart.ts'));
  });

  it('does not move a file outside the source dirs of its layer', async () => {
    const root = empty([WEB, SHARED, ADMIN, SHOP].join(',\n'));
    // The app/ dir is the source dir of web, so lib/ is outside every source dir of it.
    write(root, 'layers/web/app/utils/keep.ts', 'export const keep = 1;\n');
    write(root, 'layers/web/lib/useCart.ts', 'export const useCart = () => 1;\n');
    write(root, 'layers/shared/app/utils/noop.ts', 'export const noop = () => 0;\n');
    const importer = "import { useCart } from '../../../web/lib/useCart';";
    write(root, 'layers/admin/app/pages/admin.vue', page(importer, 'useCart();'));
    write(root, 'layers/shop/app/pages/shop.vue', page(importer, 'useCart();'));
    expect(await plan(root)).toEqual([]);
  });
});
