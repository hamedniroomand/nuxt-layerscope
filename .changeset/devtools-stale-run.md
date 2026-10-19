---
'nuxt-layerscope': patch
---

The DevTools tab now shows the result of the new config when the config changes while a check runs. An ignore, a remove or an undo after a file or config change now shows a full new run. An ignore or a remove no longer writes to the baseline file of the old config when the config changed during a run: the tab asks you to try again. The tab also shows a change in the list of fixed baseline entries when nothing else changes.
