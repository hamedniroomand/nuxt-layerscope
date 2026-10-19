---
'nuxt-layerscope': patch
---

`drift` now follows a moved file that has a relative import through a symbolic link, when the link and its target did not move. Before, `drift` made the path to the real file, so the accepted finding counted as added and fixed. Now `drift` keeps the path through the link, for example `../a/x.v2` for a link to `a/foo.ts`, or `../a/lib.v2/useCart` for a link to a directory.
