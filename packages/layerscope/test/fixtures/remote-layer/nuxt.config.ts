// Committed to a local git repo by the test setup and extended through giget, so Nuxt clones it
// into node_modules/.c12 like a layer from GitHub.
export default defineNuxtConfig({
  $meta: { name: 'remote' },
  future: { compatibilityVersion: 4 },
});
