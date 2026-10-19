import { join } from 'pathe';

import type { Registry } from '#src/registry/schema.ts';

import { makeLayer, makeRegistry } from './factories.ts';
import { tempDir, write } from './watch-project.ts';

/**
 * Two layers declared by path, so no Nuxt install is needed: `admin` may not use `shop`. Both
 * sources are written: the `.d.ts` files and the registry.
 */
export function project(config = ''): string {
  const root = tempDir();
  const useCart = join(root, 'layers/shop/app/composables/useCart.ts');
  const cartSummary = join(root, 'layers/shop/app/components/CartSummary.vue');
  write(root, 'layers/shop/app/composables/useCart.ts', 'export const useCart = () => 1;\n');
  write(root, 'layers/shop/app/components/CartSummary.vue', '<template><i /></template>\n');
  write(
    root,
    '.nuxt/types/imports.d.ts',
    "export {}\ndeclare global {\n  const useCart: typeof import('../../layers/shop/app/composables/useCart').useCart\n}\n",
  );
  write(
    root,
    '.nuxt/components.d.ts',
    "export const CartSummary: typeof import('../layers/shop/app/components/CartSummary.vue')['default']\n",
  );
  const registry: Registry = {
    ...makeRegistry(),
    layers: [
      makeLayer('admin', join(root, 'layers/admin')),
      makeLayer('shop', join(root, 'layers/shop')),
    ],
    components: [
      {
        name: 'CartSummary',
        file: cartSummary,
        mode: 'all',
        island: false,
        global: false,
        priority: 0,
      },
    ],
    imports: { app: [{ name: 'useCart', from: useCart }], server: [], shared: [] },
  };
  write(root, '.nuxt/layerscope/registry.json', JSON.stringify(registry));
  write(
    root,
    'layerscope.config.mjs',
    `export default { layers: { admin: { path: 'layers/admin', allow: [] }, shop: { path: 'layers/shop' } }${config} };\n`,
  );
  return root;
}
