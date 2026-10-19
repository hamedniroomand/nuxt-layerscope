---
'nuxt-layerscope': patch
---

Without the registry (`--source types`, or when `auto` falls back to the generated `.d.ts` files), the stale check skips a component file that Nuxt ignores (`ignore`, `ignorePrefix` or `.nuxtignore`) in the default `components/` dirs. It reads the ignore rules with the `@nuxt/kit` of the project. Before, such a file, for example `components/-Draft.vue`, gave "missing from components.d.ts" and exit code 2 on each run.
