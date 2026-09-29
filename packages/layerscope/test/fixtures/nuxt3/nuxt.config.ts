export default defineNuxtConfig({
  extends: ['./base', './checkout', './backoffice'],
  modules: ['../../../src/index.ts'],
  // Configured here instead of layerscope.config.ts, to cover the module's options.
  layerscope: {
    layers: {
      base: { allow: [] },
      checkout: { allow: ['base'] },
      backoffice: { allow: ['base'] },
    },
  },
  compatibilityDate: '2025-07-15',
});
