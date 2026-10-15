---
'nuxt-layerscope': patch
---

`check` reads `import()` in a template. A fixed path is an import. A path that is not a fixed string is reported as code that `check` cannot read.
