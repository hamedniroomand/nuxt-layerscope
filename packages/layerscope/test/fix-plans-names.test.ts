import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { LAYERS, autoImportProject, cartProject, page, plan, write } from './fix-project.ts';

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

describe('names as unimport reads them', () => {
  /** Where the plan moves the file, or `undefined` when it does not move it. */
  async function movedTo(root: string, path: string): Promise<string | undefined> {
    const moves = await plan(root);
    return moves.find(move => move.from === join(root, path))?.to;
  }

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
