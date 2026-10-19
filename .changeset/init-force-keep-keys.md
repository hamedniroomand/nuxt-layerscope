---
'nuxt-layerscope': patch
---

`init --force` keeps the config keys that it does not write, such as `baseline`, `rules` and `ignore`, and its analysis uses them. Before, it wrote only `layers` and `buildDir`, so `check` read the default baseline file again and reported the accepted findings. `init --force --baseline` writes the file that the kept `baseline` key names. A note tells you when the new config drops the expose, path or source keys of a layer. A value that is not plain data stops `init --force` with an error.
