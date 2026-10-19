---
'nuxt-layerscope': patch
---

The action reads the inputs `prepare`, `strict-baseline` and `comment` without case, as it reads `fail-on-growth`. Before, a value such as `True` was read as `false`, with no error.
