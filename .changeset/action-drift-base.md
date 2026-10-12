---
'nuxt-layerscope': patch
---

The drift step of the GitHub Action no longer makes a shallow or full clone shallower. It now finds the base commit for pull requests, pushes and merge queues, and fetches it when the clone does not have it. If the event has no base commit, or the fetch fails, the step skips the report and prints a notice.
