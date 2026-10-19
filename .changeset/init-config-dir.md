---
'nuxt-layerscope': patch
---

`init` now makes the folder of the config file when it does not exist. When `init` cannot write the config file, the error names the file and the reason. When `init --baseline` cannot write the baseline, the config is already written. The error says so and tells you to run the same command again with `--force`.
