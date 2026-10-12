---
'nuxt-layerscope': minor
---

layerscope now checks files in dirs named `modules` that are not the Nuxt modules dir, for example `app/modules/` in Nuxt 4 and `server/modules/`. Before, it skipped a `modules/` or `public/` dir at the top of each scanned dir. Now it skips only the `modules` and `public` dirs that Nuxt uses for each layer (`dir.modules` and `dir.public`). A `layerscope.config.*` file is now skipped only in the layer root, so such a file in `app/` or `server/` is checked. layerscope can report new findings in these dirs, for example layer-boundary and unused findings. Review them, or update your baseline.

`registry.json` now stores the `modules` and `public` dirs of each layer. Run `nuxi prepare` once after you update. Until then, `check` and `unused` read the generated `.d.ts` files, `--source registry` stops with an error, and the ESLint and oxlint plugins do not load the project.
