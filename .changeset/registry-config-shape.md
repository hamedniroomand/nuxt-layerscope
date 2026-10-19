---
'nuxt-layerscope': patch
---

A registry whose recorded `nuxt.config` options are not an object, for example `config: null` in a damaged file, now stops with a clear message, instead of a crash or a run that silently ignored the options. Only the project options (`preset`, `layers`, `rules`, `ignore`, `globals` and `typeImports`) are read from the registry, as the module writes them. Other keys in a hand-edited registry, such as `baseline`, are not read.
