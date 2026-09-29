import { defineConfig } from 'nuxt-layerscope';

export default defineConfig({
  layers: {
    base: { allow: [] },
    theme: { allow: ['base'] },
    shop: { allow: ['base'] },
  },
});
