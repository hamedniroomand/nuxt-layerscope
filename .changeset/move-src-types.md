---
'nuxt-layerscope': patch
---

Move suggestions now treat `types/` in `srcDir` (`app/types` by default) as an auto-import dir on Nuxt 4.6 and later. A suggested move no longer makes a name conflict with a file there.
