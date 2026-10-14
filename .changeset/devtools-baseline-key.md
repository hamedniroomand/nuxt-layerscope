---
'nuxt-layerscope': patch
---

The DevTools tab reads and writes the baseline file that the `baseline` key of `layerscope.config.ts` names. Before, the tab always wrote `layerscope-baseline.json`, so with another baseline file CI did not read what the tab wrote. The static snapshot of the tab uses the same file. Undo restores the file that the change wrote, also when the config names another file after the change.
