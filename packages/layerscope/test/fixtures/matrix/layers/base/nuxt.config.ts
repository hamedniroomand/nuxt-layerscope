export default defineNuxtConfig({
  // Nuxt 3 reads the app/ layout per layer.
  future: { compatibilityVersion: 4 },
  components: [
    { path: 'components/flat', pathPrefix: false },
    { path: 'widgets', prefix: 'W' },
    'components',
  ],
});
