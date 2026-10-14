---
'nuxt-layerscope': minor
---

`--config` is now relative to the project root, as `--baseline` is. Before, it was relative to the current directory. This changes a run with a root argument, for example `layerscope check apps/shop --config layerscope.config.ts`, and the `config` input of the GitHub Action with a `root` input. It applies to every command that takes `--config`, and `init` writes the file there. The `configFile` option of `analyze()` is now relative to `rootDir` too. An absolute path does not change.
