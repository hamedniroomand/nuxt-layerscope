---
'nuxt-layerscope': minor
---

layerscope now checks the files in a `serverDir`, `srcDir` or shared dir outside the layer root, for example `serverDir: '../api'`. Before, `check`, `unused` and the ESLint and oxlint plugins skipped them with no note. An import of such a file counted as an import from outside every layer. layerscope can report new findings in these files, for example layer-boundary and unused findings. Review them, or update your baseline. `check --watch` now also watches such a dir.

A file outside the project root has a path that starts with `../` in reports and in the baseline. For a file outside its layer root, the path that the `only` and `expose` globs match starts with `../` too, for example `../api/utils/**`. A source dir that is outside its layer root but inside the project root now belongs to its layer, not to the root layer. In ESLint and oxlint, set the `root` option for files outside the project root.
