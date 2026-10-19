---
'nuxt-layerscope': patch
---

`init --force` now keeps the `expose`, `path` and `source` keys of each old layer, and uses them in its analysis. So the baseline also has the findings that `expose` causes. When a layer in the old config has one of these keys and `init` cannot find that layer, `init` stops and writes nothing. Remove or fix that entry, and run `init` again. An old layer entry that has only `allow` is not kept.
