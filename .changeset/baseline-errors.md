---
'nuxt-layerscope': patch
---

layerscope now names the file in every error about an invalid baseline file: an empty file, a file that is not JSON, or a directory. A file from a newer layerscope now tells you to update layerscope, not to create the file again. `drift` now stops with an error when the baseline at the base ref is an empty file, is not JSON, or is a directory. Before, it read such a file as an empty baseline, and every finding showed as added. `--baseline ""` is refused with a clear message. A baseline file that cannot be read, for example because of its permissions, now stops the run with an error. Before, it was read as no baseline.
