---
'nuxt-layerscope': patch
---

The action reads drift growth only from the growth line of the report, as a whole line. Before, the text `(--fail-on-growth).` anywhere in the report, for example in a file path, counted as growth. The docs now say which commit `fail-on-growth` compares with: the latest commit of the base branch on a pull request, the commit before the push on a push, and the base of the merge group in a merge queue.
