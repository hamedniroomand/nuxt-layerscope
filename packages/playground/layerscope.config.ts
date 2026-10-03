import { defineConfig } from 'nuxt-layerscope';

// A stack: each layer may use the layers below it, and the app (root) may use all of them.
export default defineConfig({
  layers: {
    base: { allow: [] },
    ui: { allow: ['base'] },
    shop: { allow: ['ui', 'base'] },
    admin: { allow: ['shop', 'ui', 'base'] },
  },
  rules: {
    'layer-boundary': 'error',
    'shadowed-component': 'warn',
    'unresolved-reference': 'warn',
  },
});
