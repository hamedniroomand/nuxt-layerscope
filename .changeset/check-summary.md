---
'nuxt-layerscope': minor
---

The GitHub Action writes the findings of the check to the job summary, up to 200 findings, because GitHub shows at most 10 error and 10 warning annotations for each step. The new option `--summary <file>` of `check` writes that list. It works only with `--format github`.
