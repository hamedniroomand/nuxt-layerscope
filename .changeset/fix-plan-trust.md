---
'nuxt-layerscope': minor
---

`fix` plans moves that you can trust more. The root layer can be a move target. A target must permit every user and each dependency of the file, with `allow` and `expose`. The new path is checked: no file is there, no other move uses it, and Nuxt finds the file there. A move that breaks `check` together with another move is dropped. `fix` lists only the imports that change, and keeps the extension, the query and the `index` style of each specifier. It uses the baseline, and it has the new `--baseline` option. The footer says to run `layerscope check --prepare`, and one line counts the findings that have no move. The SARIF and GitLab reports now have the suggestion of each finding. The `leave` suggestion for a use of a feature layer by `root` says to change the code.
