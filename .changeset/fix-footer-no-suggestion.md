---
'nuxt-layerscope': patch
---

`fix` no longer says that each finding without a move has a suggestion. Some findings, for example of `unresolved-reference`, have none. The line now says "Run `layerscope check` to see them."
