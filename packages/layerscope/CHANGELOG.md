# Changelog

## 0.1.1

- Names inside type syntax are no longer reported as unresolved references: labeled tuple members
  (`defineEmits<{ close: [value: boolean] }>()`) and parameters of function types
  (`(...next: T[]) => void`) and `typeof` queries in types.
- `$fetch` is a known global, so it is no longer reported in server code.
- The docs show `defineConfig` imported from `nuxt-layerscope` in every `layerscope.config.ts` sample.

## 0.1.0

Initial release.
