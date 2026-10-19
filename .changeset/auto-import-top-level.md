---
'nuxt-layerscope': patch
---

Move suggestions and `fix` read the auto-import dirs `composables/`, `utils/`, `shared/utils/` and `shared/types/` as Nuxt reads them: only the files at the top level. Before, layerscope also read the `index` file of each sub dir, such as `composables/cart/index.ts`. Nuxt does not read that file, so a move there broke the auto-import. Such a file now gets no move. A name in such a file of a target layer is no longer a name conflict. `server/utils` does not change, because Nitro reads it at any depth.
