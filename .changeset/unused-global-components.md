---
'nuxt-layerscope': patch
---

`unused` marks global components "possibly used at runtime", and all components when the project uses Nuxt Content, which can render any component from a content file. The registry has new fields, so run `nuxi prepare` once after the update.
