---
'nuxt-layerscope': patch
---

`drift` follows the tracked files that git renames between the base ref and the working tree. A renamed file with accepted violations no longer counts as added and fixed. A new violation in it still counts as added. `drift` also finds a renamed baseline file in the root at its old path on the base ref. A copy, a move to another layer for a finding that names a target layer, a rename that git does not find, an alias import of a renamed file, and a relative import that is not in the form that `fix` writes still count as added and fixed. If git fails while it lists the renames, `drift` stops with exit code `2`.
