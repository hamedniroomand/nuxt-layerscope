---
'nuxt-layerscope': patch
---

Under `nuxi dev`, the module now writes the registry again after you add or delete a file, also when Nuxt does not generate its templates again, for example after you add a server util. Before, `check --watch` and the MCP server stopped with the stale error until `nuxi prepare` ran, and the DevTools tab kept the old symbols. After you delete a server util or remove its exports, the registry no longer lists its auto-imports.
