---
'nuxt-layerscope': patch
---

`fix` and the move suggestions of `check` read the names of a file as Nuxt reads them. Type exports (`export type`, `export interface`) and `export * as name` are names, and so are the other forms that Nuxt reads, for example `export const a = 1, b = 2`. A file with `export * from` can have any name, so it conflicts with any auto-import on the other side of a move.
