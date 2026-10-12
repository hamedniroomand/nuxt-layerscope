---
'nuxt-layerscope': minor
---

`layerscope unused` counts more uses. It now counts the uses in `nuxt.config.*`, in the Nuxt `modules/` dir, in files of extra auto-import and component dirs, and in the project files that counted files import.
A symbol that only one of these files uses is no longer listed as unused. `check`, `fix` and `why` do not change: they do not read these files.

`analyze` has a new `extraFiles` option (default `false`) that turns this on for `unused` and the DevTools Unused view.
