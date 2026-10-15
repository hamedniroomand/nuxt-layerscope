---
'nuxt-layerscope': minor
---

Add `drift --fail-on-growth` and the action input `fail-on-growth`. They fail when the code has errors that the baseline on the base branch does not have, also when the pull request adds them to the baseline. Before, the drift report showed the growth but could not fail the job.
