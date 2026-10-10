---
'nuxt-layerscope': patch
---

Do not report `<component :is>` when the bound value can only be a native HTML or SVG element name, such as a string literal, a ternary of them, or a prop typed as element names or defaulting to one.
