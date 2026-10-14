---
'nuxt-layerscope': patch
---

`drift` now finds the `--baseline` file in the same way as `check`, so an absolute path and a path with backslashes now work. `drift` stops with exit code 2 and a message when the baseline is outside the git repository, or when the baseline is a symbolic link on the base ref. Before, `drift` counted the base as empty with no message, or said that the link is not valid JSON. On a file system that ignores case, `drift` now also finds a baseline file name in the wrong case.
