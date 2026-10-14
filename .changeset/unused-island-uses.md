---
'nuxt-layerscope': patch
---

`unused` counts `<NuxtIsland name="X">` as a use of the island component `X`. When a file calls `resolveDynamicComponent(x)` with a value that is not a fixed string, unused components are marked "possibly used at runtime". Before, an island component that only `<NuxtIsland>` rendered was listed as unused. `check` also reads the use, so an island of another layer can give a `layer-boundary` finding. The generated .d.ts files do not list island components, so `check` sees this use only with the registry.
