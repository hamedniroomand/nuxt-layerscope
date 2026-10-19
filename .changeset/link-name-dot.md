---
'nuxt-layerscope': patch
---

`fix` makes a correct path for an import through a link whose name has a dot, such as `./x.v2` for a link to `foo.ts`. Before, the new path had the name of the target with the dot part of the link name, such as `../b/foo.v2`, and that path did not resolve. A link name with the same name as its target, such as `./foo.v2` for a link to `foo.ts`, still keeps the dot part.
