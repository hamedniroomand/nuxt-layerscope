---
'nuxt-layerscope': patch
---

layerscope no longer suggests a move of a file when a layer other than the owner and the target has an auto-import or a component with the same name, in the dirs that Nuxt scans by default. Nuxt then uses only one of the files, for most dirs the one of the layer that comes first. So after the move, the file of that other layer could take the name, and the code that uses the name would get another file. layerscope does not compare the layer order, so such a layer stops the move also when the target comes first. One `export * from` a package in an auto-import dir of any layer now stops every move of a file with auto-import names.
