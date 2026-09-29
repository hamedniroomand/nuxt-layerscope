# Contributing

Thanks for taking the time to help. Bug reports, docs fixes and pull requests are all welcome.

## Reporting a bug

Open an [issue](https://github.com/hamedniroomand/nuxt-layerscope/issues/new/choose) with your
Nuxt version, the layer setup (`extends`, local or remote layers) and the output of
`npx layerscope check --json`. A small reproduction repo makes it much faster to fix.

## Setting up

The repo is a pnpm workspace driven by [Vite+](https://viteplus.dev). Install `vp`, then:

```bash
vp install      # after cloning and after every pull
vp run ready    # format, lint, type check, test and build
vp run dev      # run the docs site locally
```

The [development guide](./packages/docs/contributing/development.md) covers the layout, the test
fixtures and snapshots.

## Pull requests

- Keep a pull request to one change, and open an issue first for anything large.
- Add or update a test in `packages/layerscope/test`; fixtures are real Nuxt projects.
- Run `vp check --fix` and `vp test` before pushing.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org), for
  example `fix(layerscope): resolve components in custom dirs`.
- Add a line to `packages/layerscope/CHANGELOG.md` for anything users will notice.

By contributing you agree that your work is released under the [MIT license](./LICENSE) and
that you'll follow the [code of conduct](./CODE_OF_CONDUCT.md).
