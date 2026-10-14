---
'nuxt-layerscope': patch
---

The stale check skips the new files that Nuxt ignores (`ignore`, `ignorePrefix` and `.nuxtignore`) in component dirs and in the auto-import dirs of the app. Before, a new test file such as `composables/useCart.spec.ts` stopped `check --watch` and the MCP server until `nuxi prepare`. Nitro auto-imports such files from its dirs, such as `server/utils` and `shared/utils`, so the check still reports them there. The registry has new fields, so run `nuxi prepare` once after the update.
