---
'nuxt-layerscope': minor
---

`layerscope unused` now lists what it does not count. It lists each file that layerscope could not read in full: a parse error, an unread template, an `import()` or `require()` with a path that is not a fixed string, or an `import.meta.glob()`. When such a file exists, the report does not say that every symbol is referenced.

The last line of the text report names the other uses that are not counted: test files, files that match `ignore`, and files in layers installed as packages. The JSON report has a new `blindSpots` field, and the DevTools Unused view shows the same data. `findBlindSpots` is a new export of `nuxt-layerscope/api`.
