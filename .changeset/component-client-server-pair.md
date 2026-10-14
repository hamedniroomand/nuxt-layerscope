---
'nuxt-layerscope': patch
---

Check a use of a component against each of its files when Nuxt keeps more than one file with the same name, for example `Pair.client.vue` in one layer and `Pair.server.vue` in another layer. Nuxt uses one file in the browser and one file on the server. Before, layerscope checked only one of the files, so a use of a layer that is not allowed could get no finding. `why`, `unused` and the DevTools trace now list each file. The `can_use` MCP tool answers with the first file that is not allowed. So `check` can report new findings after the update, also for a file that Nuxt does not use for a given use.
