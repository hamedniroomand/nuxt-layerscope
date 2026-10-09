# Changesets

A pull request that changes what users see adds a changeset: run `pnpm changeset`, choose the bump
(patch, minor or major) and write one or two sentences that will become the changelog entry.
Commit the file that it makes in `.changeset/` with the pull request.

A pull request that users will not notice (docs, tests, CI, refactors) needs none. Run
`pnpm changeset --empty` if you want to say so.

Maintainers: a workflow opens a "version packages" pull request from the changesets on `main`.
See [Releasing](https://layerscope.kitdev.space/contributing/releasing).
