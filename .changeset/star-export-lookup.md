---
'nuxt-layerscope': patch
---

Move suggestions and `fix` find the file of a relative `export * from` in an auto-import dir as unimport finds it: `x.mts`, `x/index.mts`, `x.cts`, and so on, in the order of unimport. Before, they used the import resolver, so they could read the names of another file than Nuxt reads, or of a file that Nuxt does not read, such as `./y.js` for `y.ts`.
