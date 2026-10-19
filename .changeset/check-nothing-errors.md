---
'nuxt-layerscope': patch
---

`check` with file arguments, `--staged`, `--changed` or `--since` and no source file to check now reads the config and the baseline, and exits `2` when it cannot read them. Before, it exited `0` without reading them in the text and github formats, and the json, sarif and gitlab formats gave an empty report for any error, for example a syntax error in the config or a damaged baseline. A missing or old `.nuxt` still gives exit `0`; in the json, sarif and gitlab formats the report is empty and has a note.
