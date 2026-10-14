---
'nuxt-layerscope': patch
---

`unused` counts `<NuxtIsland name="X">` as a use of the island component `X`. Before, an island component that only `<NuxtIsland>` rendered was listed as unused. `<NuxtIsland :name>` and `resolveDynamicComponent(x)` with a value that is not a fixed string mark unused components as "possibly used at runtime". `check` also reads `<NuxtIsland name="X">`, so an island of another layer can give a `layer-boundary` finding. `check` sees this only with the registry, because the generated .d.ts files do not list island components.
