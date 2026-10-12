---
'nuxt-layerscope': minor
---

check now reads TypeScript syntax in a template when the component has a TypeScript script. It reports code that it cannot read as unresolved-reference findings: a template that it cannot parse, a template with a lang other than HTML or with src, a dynamic import() or require(), and import.meta.glob(). It no longer drops this code silently. An import() or require() with a template literal that has no ${} is now read as a fixed path, so it can give new layer-boundary findings.
