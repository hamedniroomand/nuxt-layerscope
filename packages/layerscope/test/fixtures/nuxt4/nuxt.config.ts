export default defineNuxtConfig({
  // Explicit, because the `ui` layer's `srcDir: 'src'` would otherwise leak into this project.
  srcDir: 'app',
  extends: ['fixture-layer-ui'],
  modules: ['../../../src/index.ts'],
  compatibilityDate: '2025-07-15',
});
