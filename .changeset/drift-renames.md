---
'nuxt-layerscope': patch
---

`drift` follows renamed files. A file that a change renames, with its accepted violations, no longer counts as added and fixed. drift maps the path of each finding in the file and the path in a relative import of a renamed file. When the baseline file itself is renamed, drift reads it at its old path on the base ref.
