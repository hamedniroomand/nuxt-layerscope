---
'nuxt-layerscope': patch
---

`check` reads `import()` in a template. An `import()` with a fixed path is now an import, so it can give `layer-boundary` findings and it counts as a use in `unused` and `why`. An `import()` with a path that is not a fixed string is reported by `unresolved-reference`, and `unused` lists the file as unread.
