---
'nuxt-layerscope': patch
---

Check an explicit import of an npm or workspace layer by its package name, for example `@acme/ui-layer/app/composables/useAcme`, and a `require()` of it. Before, such an import was always allowed. The import resolves to the file in the layer, with the `exports` of the layer's `package.json` when it has them. A path that the layer does not have or does not export is reported by `unresolved-reference`. An import of a layer by its package name that Node cannot find from the importing file is now reported by `unresolved-reference`. A layer with a `package.json` that exists but cannot be read, or that is not valid JSON, now stops the run with an error.
