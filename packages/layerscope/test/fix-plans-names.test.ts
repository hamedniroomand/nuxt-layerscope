import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import {
  LAYERS,
  autoImportProject,
  cartProject,
  declareCart,
  page,
  plan,
  write,
} from './fix-project.ts';

/** Where the plan moves the file, or `undefined` when it does not move it. */
async function movedTo(root: string, path: string): Promise<string | undefined> {
  const moves = await plan(root);
  return moves.find(move => move.from === join(root, path))?.to;
}

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

  it('moves an auto-import into a layer with the name in the index file of a sub dir', async () => {
    // Nuxt does not read `composables/cart/index.ts`, so its name is no auto-import.
    const root = autoImportProject('layers/web/app/composables/useCart.ts');
    write(root, 'layers/shared/app/composables/cart/index.ts', 'export const useCart = () => 2;\n');
    expect(await plan(root)).toHaveLength(1);
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

describe('a name that a third layer has', () => {
  // Nuxt uses only one of the files. After a move, the file of a third layer could win the name.
  // layerscope does not compare the order, so each third layer stops the move.
  const EXTRA = "extra: { path: 'layers/extra', allow: [] }";

  it('does not move an auto-import when a third layer exports the name', async () => {
    const root = autoImportProject('layers/web/app/composables/useCart.ts', [...LAYERS, EXTRA]);
    expect(await plan(root)).toHaveLength(1);
    write(root, 'layers/extra/app/composables/useCart.ts', 'export const useCart = () => 3;\n');
    expect(await plan(root)).toEqual([]);
  });

  it('does not move an auto-import when a third layer has names that are not read', async () => {
    const root = autoImportProject('layers/web/app/composables/useCart.ts', [...LAYERS, EXTRA]);
    write(root, 'layers/extra/app/utils/lib.ts', "export * from 'cart-lib';\n");
    expect(await plan(root)).toEqual([]);
  });

  it('does not move a component when a third layer has a component of the same name', async () => {
    const root = cartProject([...LAYERS, EXTRA]);
    write(root, 'layers/web/app/components/BaseButton.vue', '<template><button /></template>\n');
    write(
      root,
      '.nuxt/components.d.ts',
      `export {}\nexport const BaseButton: typeof import("../layers/web/app/components/BaseButton.vue")['default']\n`,
    );
    const template = '<template><BaseButton /></template>\n';
    write(root, 'layers/admin/app/pages/admin.vue', template);
    write(root, 'layers/shop/app/pages/shop.vue', template);
    expect(await plan(root)).toHaveLength(1);
    write(root, 'layers/extra/app/components/BaseButton.vue', '<template><i /></template>\n');
    expect(await plan(root)).toEqual([]);
  });
});

describe('a moved file with `export * from`', () => {
  // layerscope does not read a package, so the names are unknown. The package is no layer, so only
  // the names stop the move.
  const REEXPORT = "export * from 'cart-lib';\n";

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

describe('a relative `export * from`', () => {
  const BARREL = "export * from '../lib/cart';\n";

  it('adds the names of the file, so only a name in it stops the move', async () => {
    const root = autoImportProject('layers/web/app/composables/useCart.ts');
    write(root, 'layers/shared/app/utils/barrel.ts', BARREL);
    write(root, 'layers/shared/app/lib/cart.ts', 'export const useBasket = () => 2;\n');
    expect(await plan(root)).toHaveLength(1);
    write(root, 'layers/shared/app/lib/cart.ts', 'export const useCart = () => 2;\n');
    expect(await plan(root)).toEqual([]);
  });

  it('stops at a cycle', async () => {
    const root = autoImportProject('layers/web/app/composables/useCart.ts');
    write(root, 'layers/shared/app/utils/a.ts', "export * from './b';\n");
    write(root, 'layers/shared/app/utils/b.ts', "export * from './a';\n");
    expect(await plan(root)).toHaveLength(1);
  });

  it('counts any name when the chain reaches a package', async () => {
    const root = autoImportProject('layers/web/app/composables/useCart.ts');
    write(root, 'layers/shared/app/utils/barrel.ts', BARREL);
    write(root, 'layers/shared/app/lib/cart.ts', "export * from 'cart-lib';\n");
    expect(await plan(root)).toEqual([]);
  });
});

describe('names as unimport reads them', () => {
  it('keeps the case of a default export named after a file without `-`, `_` or `.`', async () => {
    const root = cartProject(LAYERS);
    const path = 'layers/web/app/composables/Basket.ts';
    write(root, path, 'export default () => 1;\n');
    write(
      root,
      '.nuxt/types/imports.d.ts',
      "export {}\ndeclare global {\n  const Basket: typeof import('../../layers/web/app/composables/Basket')['default']\n}\n",
    );
    write(root, 'layers/admin/app/pages/cart.vue', page('Basket();'));
    write(root, 'layers/shop/app/pages/cart.vue', page('Basket();'));
    expect(await movedTo(root, path)).toBeDefined();
    write(root, 'layers/shared/app/utils/cart.ts', 'export const Basket = 2;\n');
    expect(await movedTo(root, path)).toBeUndefined();
  });

  it.each([
    ['cart.tsx', 'export const useCart = () => 2;'],
    ['useCart.jsx', 'export default () => 2;'],
  ])('reads %s in the target', async (file, content) => {
    const root = autoImportProject('layers/web/app/composables/useCart.ts');
    expect(await plan(root)).toHaveLength(1);
    write(root, `layers/shared/app/utils/${file}`, `${content}\n`);
    expect(await plan(root)).toEqual([]);
  });
});

describe('the server utils of the target', () => {
  it('reads a sub dir at any depth, as Nitro does', async () => {
    const root = cartProject(LAYERS);
    const path = 'layers/web/server/utils/useCart.ts';
    write(root, path, 'export const useCart = () => 1;\n');
    declareCart(root, path, '.nuxt/types/nitro-imports.d.ts');
    write(root, 'layers/admin/server/api/admin.ts', 'export default () => useCart();\n');
    write(root, 'layers/shop/server/api/shop.ts', 'export default () => useCart();\n');
    expect(await movedTo(root, path)).toBeDefined();
    write(
      root,
      'layers/shared/server/utils/db/cart/useCart.ts',
      'export const useCart = () => 2;\n',
    );
    expect(await movedTo(root, path)).toBeUndefined();
  });
});
