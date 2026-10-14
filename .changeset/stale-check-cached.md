---
'nuxt-layerscope': patch
---

`check --watch` and the MCP server now run the stale check on each run, not only when the generated files change. A new component or auto-import file, or a deleted one, now gives the stale error until `nuxi prepare` writes the generated files again. Under `nuxi dev`, the layerscope module writes the registry again after such a change. Before this change, `check --watch` and the MCP server kept the old symbol table with no error.
