---
'nuxt-layerscope': patch
---

The GitHub Action runs the nuxt-layerscope version of its own release when the project does not install it, so a tag pins the CLI too. The step that posts the comment is separate from the steps that run the CLI, so the action does not give its token to the CLI.
