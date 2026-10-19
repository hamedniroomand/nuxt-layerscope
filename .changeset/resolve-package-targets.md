---
'nuxt-layerscope': patch
---

An import of a layer by its package name now finds the file when `exports` or `main` names it without an extension, or with `.js` for a `.ts` file, as Vite does. An import of a path that `exports` sets to `null` no longer resolves to a file. A layer `package.json` with an invalid `exports`, a leading BOM or comment lines now stops the run with an error that names the file, when the layer is imported by its package name. Before, layerscope did not see the problem, and such an import did not resolve.
