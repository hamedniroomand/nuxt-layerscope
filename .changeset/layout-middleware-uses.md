---
'nuxt-layerscope': minor
---

`layer-boundary`, `layer-internal` and the other rules that read dependencies now check a layout or a route middleware that a file names with a fixed string in `definePageMeta()` or `setPageLayout()`. The dependency goes to the file that Nuxt uses for the name. This needs the registry of the Nuxt module. Run "nuxi prepare" after the update to write the registry again.
