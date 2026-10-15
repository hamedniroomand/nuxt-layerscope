---
'nuxt-layerscope': patch
---

`fix` and the move suggestions of `check` read the names of a file with mlly, the parser that Nuxt uses. Type exports (`export type`, `export interface`) and `export * as name` are names, and so are the other forms that Nuxt reads, for example `export const a = 1, b = 2`. A relative `export * from` is read. An `export * from` a package or an alias, or one whose path does not resolve, can export any name, so it conflicts with any auto-import on the other side of a move.
