---
'nuxt-layerscope': minor
---

New option `typeImports`. With `'ignore'`, a type-only import makes no dependency, so no rule reports it and it is not in the graph. The forms are `import type`, `import { type A }` with `type` on every name, `export type ... from` and `import type x = require(...)`. An import with value names still counts, with the value names only. The default is `'check'`, which keeps the old result.
