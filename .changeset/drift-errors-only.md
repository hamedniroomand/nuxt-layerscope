---
'nuxt-layerscope': patch
---

`drift` now counts only the findings of rules that the current config sets to `error`. Before, `drift` counted a warning on the base as added on each pull request when the base baseline did not have it.
