---
'nuxt-layerscope': patch
---

The stale check now finds a new auto-import file, such as a composable that overrides one of a lower layer. layerscope stops with exit code 2 and asks you to run "nuxi prepare" again. This check uses the registry of the module. The `types` source does not check auto-import files.

The registry has a new `importDirs` field. A registry that an earlier release wrote does not have it. With `--source auto`, layerscope then falls back to the `.d.ts` files and prints a note. With `--source registry`, it stops with exit code 2. Run "nuxi prepare" again.

When the module cannot read the auto-import dirs of Nuxt, it prints a warning with the reason and writes `importDirs: null`. Then layerscope prints a note and does not check auto-import files.
