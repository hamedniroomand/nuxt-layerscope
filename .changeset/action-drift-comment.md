---
'nuxt-layerscope': patch
---

The drift comment of the GitHub Action now posts one comment for each root. Later runs update the comment that the same account wrote, so steps with different roots no longer overwrite each other, and the action no longer edits a comment that another account wrote. If drift fails, the comment says so. On a `pull_request` event from a fork, or when the action cannot post the comment, it prints a notice or a warning. A failed comment does not fail the step. A new `comment` output says what the action did.
