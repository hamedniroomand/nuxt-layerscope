---
'nuxt-layerscope': patch
---

Fix two `unresolved-reference` messages. A component that Nuxt does not have is now "Nuxt has no component <X>"; before, the message named `components.d.ts` also when the source was the registry. A name that is an auto-import only in another context, or that is a component, now says so and no longer tells you to add it to `globals`, which would hide the use of another layer.
