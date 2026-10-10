---
'nuxt-layerscope': minor
---

Allow `root` as a base layer of a preset, for example `preset: { name: 'features', base: ['root'] }`, so feature layers can use the project's own code without a hand-written `allow`. `root` is always the lowest base layer. The allow hint names the preset base when the preset gave the layer its `allow`.
