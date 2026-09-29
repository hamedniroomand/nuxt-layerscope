import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';

import { REGISTRY_VERSION } from '#src/registry/schema.ts';
import type { Registry } from '#src/registry/schema.ts';

import { makeLayer } from './factories.ts';

/** A Nuxt-like project where the `web` layer calls an auto-import that the `shop` layer owns. */
export function createProject(): { dir: string; registryFile: string; consumer: string } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-cache-')));
  const composable = join(dir, 'layers/shop/composables/useCart.ts');
  const consumer = join(dir, 'layers/web/app.ts');
  mkdirSync(join(dir, 'layers/shop/composables'), { recursive: true });
  mkdirSync(join(dir, 'layers/web'), { recursive: true });
  writeFileSync(composable, 'export const useCart = () => 1;');
  writeFileSync(consumer, 'export const total = useCart();');
  const registry: Registry = {
    version: REGISTRY_VERSION,
    generator: { name: 'nuxt-layerscope', version: '0.0.0', nuxt: '4.0.0' },
    layers: [
      makeLayer('web', join(dir, 'layers/web')),
      makeLayer('shop', join(dir, 'layers/shop')),
    ],
    components: [],
    shadowedComponents: [],
    componentDirs: [],
    imports: { app: [{ name: 'useCart', from: composable }], server: [], shared: [] },
  };
  const registryFile = join(dir, '.nuxt/layerscope/registry.json');
  mkdirSync(join(dir, '.nuxt/layerscope'), { recursive: true });
  writeFileSync(registryFile, JSON.stringify(registry));
  return { dir, registryFile, consumer };
}
