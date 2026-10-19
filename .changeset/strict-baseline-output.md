---
'nuxt-layerscope': patch
---

With `--strict-baseline` and only fixed baseline entries, the text report no longer shows the green "No problems" line above the line that fails the check. The hint for fixed entries, in the text report and in the GitHub annotations, now gives the full `--update-baseline` command with the same root, `--config`, `--source`, `--baseline` and `--prepare` as the run. A value that starts with `-` is written as `--config=-c.ts` in that command, so the command runs as shown.
