---
'nuxt-layerscope': patch
---

`drift` gives git only the files of the project when it looks for renamed files, so it is faster in a large repository. When git skips its rename check because more files changed than its rename limit, `drift` now prints a note. Before, the files that `fix` moved then counted as added and fixed, with no message.
