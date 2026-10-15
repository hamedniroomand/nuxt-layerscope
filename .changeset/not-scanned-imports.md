---
'nuxt-layerscope': patch
---

The `fix` note about the files that `check` and `fix` skip now says that they do not check the imports in these files. Before, it said that they do not read them, but layerscope loads `nuxt.config.*` to find the layers.
