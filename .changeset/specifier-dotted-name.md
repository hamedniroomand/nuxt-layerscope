---
'nuxt-layerscope': patch
---

`fix` keeps a name with a dot when it rewrites an import to a file that it found through a symbolic link. Before, the end of the name was added again: `./x.module` for `x.module.ts` got `x.module.module`, and `./lib.v2` for `lib.v2/index.ts` got `lib.v2/index.v2`.
