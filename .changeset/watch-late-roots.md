---
'nuxt-layerscope': patch
---

`check --watch` now checks again after it starts to watch a layer dir outside the project root. A file saved in such a dir during the first check is now in the report. An error from the file watcher no longer stops the watch, also an error at the start for a dir that it cannot read. layerscope prints a warning, and the watch goes on.
