---
'nuxt-layerscope': patch
---

layerscope no longer suggests a move of a script file (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.mts`, `.cjs` or `.cts`) into a layer that sets `imports.dirs` to a list that is not empty, or turns `imports.scan` off. Such a layer can scan the dir that the file goes to, also when only explicit imports use the file, and Nuxt then uses only one of two auto-imports with the same name. Before, only a file that was used as an auto-import got this check.
