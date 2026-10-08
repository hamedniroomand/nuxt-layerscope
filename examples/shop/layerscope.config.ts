import { defineConfig } from 'nuxt-layerscope';

export default defineConfig({
  // The "layered" preset lets every layer use `shared` and nothing else.
  preset: 'layered',
  layers: {
    // The one exception: the admin area must know who is signed in.
    admin: { allow: ['shared', 'auth'] },
  },
  rules: {
    'layer-boundary': 'error',
    'layer-cycle': 'error', // off by default
    'unresolved-reference': 'error',
    'shadowed-component': 'error',
  },
});
