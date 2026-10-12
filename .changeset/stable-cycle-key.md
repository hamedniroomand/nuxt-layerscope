---
'nuxt-layerscope': minor
---

A baselined layer cycle now stays accepted when the file of its first use changes. This is the case when you delete that file, or add a use in a file that sorts earlier. A `layer-cycle` entry in the baseline now matches by its chain of layers, not by its file. Old baselines still match, with one exception. layerscope now picks the cycle in a fixed way. When two cycles of the same length go through one layer, it always shows the same one. In that case layerscope can report a baselined cycle as new once after the upgrade. Run `layerscope check --update-baseline` to accept it. Entries for the same cycle in an old baseline are merged into one entry with a `count`. The text output no longer adds the target layer to a cycle entry. The SARIF and GitLab fingerprints of `layer-cycle` findings change once.
