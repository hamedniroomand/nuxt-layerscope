---
'nuxt-layerscope': patch
---

Arguments after `--` are used as positional arguments, for example a root that starts with `-`. Before, layerscope ignored them. A command line that has words after `--` can now stop with an error, or `check` can read them as the root and the files. Remove the words that are not a root or a file.
