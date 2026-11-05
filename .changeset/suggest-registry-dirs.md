---
'nuxt-layerscope': patch
---

With the registry, the move suggestions now read the names in the auto-import and component dirs that each layer adds with `imports.dirs` or `components`, and check a move whose destination is in such a dir. Before, a move could give a file the same name as a file in such a dir of another layer.
