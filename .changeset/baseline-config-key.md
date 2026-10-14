---
'nuxt-layerscope': minor
---

A new `baseline` key in `layerscope.config.ts` names the baseline file once. `check` (also with `--update-baseline`, `--summary` and `--watch`), `drift`, `fix`, `mcp` and the GitHub Action use it. `init --baseline` does not use it. The `--baseline` option and the `baseline` input of the action override it. The `baseline` input of the action now has no default value, so the key applies. `analyze()` accepts `baseline: true` for the file of the config.
