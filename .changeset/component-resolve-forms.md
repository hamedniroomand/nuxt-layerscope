---
'nuxt-layerscope': patch
---

Resolve more component uses as Nuxt does. These are now uses of the component: `resolveComponent()` with a template literal that has no `${}`, `resolveComponent()` with a kebab-case name such as `'cart-summary'`, and `h(CartSummary)` in a `.vue`, `.jsx` or `.tsx` file outside the `server/` dir, also when an import or a local binding has that name. Before, `unresolved-reference` reported the first two and an `h()` name with no binding as warnings, so a use of a layer that is not allowed got no `layer-boundary` finding.
