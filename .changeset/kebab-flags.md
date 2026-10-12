---
'nuxt-layerscope': patch
---

`init --dry-run`, `check --update-baseline` and `fix --dry-run` now work when you write the flag before the root. Before, the flag took the root as its value, so the command did not use the root. `init --dry-run app` worked on the current dir, and it could write `layerscope.config.ts` there. `check --update-baseline app` checked the current dir and wrote no baseline. `fix --dry-run app` stopped with an error.
