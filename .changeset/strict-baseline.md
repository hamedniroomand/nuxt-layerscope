---
'nuxt-layerscope': minor
---

Add `check --strict-baseline` and the action input `strict-baseline`. They fail the check when the baseline has fixed entries, so a fixed violation cannot come back while its entry is still in the file. The message tells you to run `layerscope check --update-baseline`. Without the option, fixed entries are listed as before and do not fail the check.
