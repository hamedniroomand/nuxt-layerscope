---
'nuxt-layerscope': patch
---

`fix` keeps a dotted name in an import that it rewrites when the file was found through a symbolic link. Before, `./x.module` for `x.module.ts` became `./x.module.module`, and `./lib.v2` for `lib.v2/index.ts` became `./lib.v2/index.v2`.
