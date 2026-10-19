---
'nuxt-layerscope': patch
---

`check --update-baseline`, `init --baseline` and the DevTools tab now make the folder of the baseline file when it does not exist. When layerscope cannot make the folder or write the file, the error names the file and the reason, for example `Cannot write /app/ci/layerscope-baseline.json (EACCES).`
