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

## Trying the DevTools tab

```bash
vp run playground
```

This builds the tab and starts `nuxi dev` on [`packages/playground`](./packages/playground), a
small app with four layers and a few findings on purpose. Open the printed URL, press
<kbd>Shift</kbd> + <kbd>Alt</kbd> + <kbd>D</kbd> and select **Layerscope**; in a small window it is
in the <kbd>⋮</kbd> menu, where you can pin it. You can also open `/__layerscope` directly. Save a
file under `layers/` to see a live update.

- The dev server serves the built tab, so run `vp run nuxt-layerscope#build` again after you change
  the client, then reload.
- Nuxt runs one dev server per project: stop the playground before `vp run docs#screenshots`.
- Ignore and Undo write `layerscope-baseline.json` in the playground. Restore it with
  `git checkout` when you are done.
- The playground's README lists the findings it has on purpose. A test pins them.
- The playground is for work on layerscope. [`examples/shop`](./examples/shop) is the project for new users to try. Do not mix them. `vp run example:verify` checks the example.

## Updating the DevTools screenshots

The docs and the READMEs show the DevTools tab in pictures that a script makes from the playground.
After a change to the tab or to the playground, make them again:

```bash
vp run nuxt-layerscope#build
vp run docs#screenshots
```

The script uses the Chrome on your machine (set `CHROME_PATH` if it cannot find it). Stop
`vp run playground` first, because Nuxt runs only one dev server per project. Two runs on the same
UI give the same files, so `git status` shows only the pictures that changed. See [`packages/docs/scripts`](./packages/docs/scripts/README.md).

## Pull requests

- Keep a pull request to one change, and open an issue first for anything large.
- Add or update a test in `packages/layerscope/test`; fixtures are real Nuxt projects.
- Run `vp check --fix` and `vp test` before pushing.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org), for
  example `fix(layerscope): resolve components in custom dirs`.
- Add a line to `packages/layerscope/CHANGELOG.md` for anything users will notice.

By contributing you agree that your work is released under the [MIT license](./LICENSE) and
that you'll follow the [code of conduct](./CODE_OF_CONDUCT.md).
