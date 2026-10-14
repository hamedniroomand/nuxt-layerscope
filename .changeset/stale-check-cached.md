---
'nuxt-layerscope': patch
---

`check --watch` and the MCP server now run the stale check on each run, not only when the generated files change. A new component or auto-import file, or a deleted one, now gives the stale error until `nuxi prepare` writes the generated files again. Under `nuxi dev`, Nuxt does this for a new component or composable, but not for a new server util. Before, they kept the old symbol table with no error.
