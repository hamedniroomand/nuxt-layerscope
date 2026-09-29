import { defineConfig } from 'nuxt-layerscope';

export default defineConfig({
  layers: {
    shared: { allow: [] },
    auth: { allow: ['shared'] },
    web: { allow: ['shared', 'auth', 'ui'] },
    admin: { allow: ['shared', 'auth'] },
  },
  rules: {
    'layer-boundary': 'error',
    'unresolved-reference': 'warn',
  },
});
