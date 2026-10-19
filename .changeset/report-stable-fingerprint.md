---
'nuxt-layerscope': patch
---

SARIF and GitLab reports now keep the fingerprint of each finding the same on every run, also for two findings of one use that differ only in their target file or message. Before, the two could swap fingerprints when the order of the targets changed. After the update, such an alert can show the other target one time.
