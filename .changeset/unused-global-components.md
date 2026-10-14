---
'nuxt-layerscope': patch
---

`unused` marks global components "possibly used at runtime". When the project uses Nuxt Content, which can render any component by its name from a content file, `unused` marks every component. Each unused entry has a new `global` field, and `blindSpots` has a new `nuxt-content` kind. With `--source types`, `unused` finds only the `components/global/` dir and the `.global` suffix, and finds Nuxt Content only when `modules` names it as a string. The registry has new fields, so run `nuxi prepare` once after the update.
