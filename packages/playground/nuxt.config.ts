// The module comes from source, so changes to the analyzer and the server need no build. The tab's
// client comes from packages/layerscope/dist/devtools: run `vp run nuxt-layerscope#build` after a
// change to it.
export default defineNuxtConfig({
  modules: ['../layerscope/src/index.ts'],
  devtools: { enabled: true },
  compatibilityDate: '2025-07-15',
});
