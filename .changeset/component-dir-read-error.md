---
'nuxt-layerscope': patch
---

The stale check now stops with exit code 2 when it cannot open a component dir, an auto-import dir or a file that the generated types refer to, for example because it has no read access. Before, layerscope treated such a dir as empty, so it did not find a new component there and could use an old registry with no error. It also reported such a file as deleted. The message shows the path and the error code. A dir or file that does not exist is handled as before.
