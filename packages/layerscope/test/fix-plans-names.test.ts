import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { layerFromPath } from '#src/nuxt/layer-factory.ts';
import type { Registry, RegistryImportDir } from '#src/registry/schema.ts';
import { makeRegistry } from '#test/factories.ts';

import {
  LAYERS,
  autoImportProject,
  cartProject,
  declareCart,
  empty,
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

const EXTRA = "extra: { path: 'layers/extra', allow: [] }";

/** A registry of the module for the layers under `layers/`, with the given auto-import dirs. */
function writeRegistry(
  root: string,
  names: string[],
  dirs: Pick<RegistryImportDir, 'dir' | 'files'>[],
  overrides: Partial<Registry> = {},
): void {
  const registry: Registry = {
    ...makeRegistry(),
    layers: names.map(name => layerFromPath(name, join(root, 'layers', name))),
    importDirs: dirs.map(entry => ({ ...entry, globs: [entry.dir], scanner: 'nuxt' })),
    ...overrides,
  };
  write(root, '.nuxt/layerscope/registry.json', JSON.stringify(registry));
}

const NAMES = ['web', 'shared', 'admin', 'shop'];
const BUTTON = {
  name: 'BaseButton',
  mode: 'all',
  island: false,
  global: false,
  priority: 0,
} as const;

/** A project where admin and shop use the component `BaseButton` of web, through the registry. */
function buttonProject(): { root: string; web: string } {
  const root = cartProject([...LAYERS, EXTRA]);
  const web = join(root, 'layers/web/app/components/BaseButton.vue');
  write(root, 'layers/web/app/components/BaseButton.vue', '<template><button /></template>\n');
  const template = '<template><BaseButton /></template>\n';
  write(root, 'layers/admin/app/pages/admin.vue', template);
  write(root, 'layers/shop/app/pages/shop.vue', template);
  writeRegistry(root, [...NAMES, 'extra'], [], { components: [{ ...BUTTON, file: web }] });
  return { root, web };
}

describe('the dirs of the registry', () => {
  it('checks a destination in a dir that a layer adds with `imports.dirs`', async () => {
    // `stores` is scanned by no default. The target has the name in its `utils` dir.
    const root = empty(LAYERS.join(',\n'));
    const path = 'layers/web/app/stores/cart.ts';
    write(root, path, 'export const useCart = () => 1;\n');
    const importCart = "import { useCart } from '../../../web/app/stores/cart';";
    write(root, 'layers/admin/app/pages/admin.vue', page(importCart, 'useCart();'));
    write(root, 'layers/shop/app/pages/shop.vue', page(importCart, 'useCart();'));
    write(root, 'layers/shared/app/utils/cart.ts', 'export const useCart = () => 2;\n');
    writeRegistry(root, NAMES, []);
    expect(await plan(root)).toHaveLength(1);
    writeRegistry(root, NAMES, [{ dir: join(root, 'layers/shared/app/stores'), files: [] }]);
    expect(await plan(root)).toEqual([]);
    // A dir given as a glob is matched by its path before the glob.
    writeRegistry(root, NAMES, [{ dir: join(root, 'layers/shared/app/**/stores'), files: [] }]);
    expect(await plan(root)).toEqual([]);
  });

  it('reads the names in a dir that a third layer adds with `imports.dirs`', async () => {
    const root = cartProject([...LAYERS, EXTRA]);
    const file = join(root, 'layers/extra/app/stores/cart.ts');
    write(root, 'layers/extra/app/stores/cart.ts', 'export const useCart = () => 3;\n');
    writeRegistry(root, [...NAMES, 'extra'], []);
    expect(await plan(root)).toHaveLength(1);
    writeRegistry(
      root,
      [...NAMES, 'extra'],
      [{ dir: join(root, 'layers/extra/app/stores'), files: [file] }],
    );
    expect(await plan(root)).toEqual([]);
  });

  it('reads the components that a third layer has in a dir of `components`', async () => {
    const { root, web } = buttonProject();
    expect(await plan(root)).toHaveLength(1);
    const extra = join(root, 'layers/extra/app/widgets/BaseButton.vue');
    write(root, 'layers/extra/app/widgets/BaseButton.vue', '<template><i /></template>\n');
    writeRegistry(root, [...NAMES, 'extra'], [], {
      components: [{ ...BUTTON, file: web }],
      shadowedComponents: [{ ...BUTTON, file: extra, shadowedBy: web }],
    });
    expect(await plan(root)).toEqual([]);
  });
});
