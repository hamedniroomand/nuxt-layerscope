---
'nuxt-layerscope': patch
---

`fix` lists each import of a moved file, also when a file imports the same file more than once. Before, it listed only the first import. The suggestion of `check` (also `suggestion.impact.imports` in JSON output and the MCP `suggest` tool) now counts each import to update, so the number can be higher than before. `fix --dry-run` now shows the column of each import.
