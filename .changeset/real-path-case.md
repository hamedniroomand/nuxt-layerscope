---
'nuxt-layerscope': patch
---

Fix path checks on case-insensitive file systems and on Windows. Layerscope now uses the real case of a path and forward slashes. `--prepare` now starts `npx` on Windows and shows the error when it cannot start.
