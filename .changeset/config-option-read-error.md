---
'nuxt-layerscope': patch
---

`--config` with an empty value, a number or a second `--config` now stops with a clear message and exit code 2. Before, it gave an error such as "input.replace is not a function". When layerscope cannot read a folder on the path of the config file, it now says so and stops. Before, it said "Config file not found", or it ran with no config. In the JS API, `analyze({ baseline: false })` now applies no baseline.
