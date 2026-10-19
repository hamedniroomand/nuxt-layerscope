---
'nuxt-layerscope': patch
---

`resolveComponent()` directly in a top-level `const` of `<script setup>`, as in `const C = resolveComponent('MyButton')` with `<component :is="C">`, no longer gives a dynamic component warning. `unused` no longer marks every unused component as possibly used for such a file.
