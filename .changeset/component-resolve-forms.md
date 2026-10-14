---
'nuxt-layerscope': patch
---

Resolve more component uses as Nuxt does: `resolveComponent()` with a template literal that has no `${}`, `resolveComponent()` with a kebab-case name such as `'cart-summary'`, and `h(CartSummary)` with no import in a `.vue`, `.jsx` or `.tsx` file. Before, `unresolved-reference` reported each of these as a warning, so a use of a layer that is not allowed got no `layer-boundary` finding.
