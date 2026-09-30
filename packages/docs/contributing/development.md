# Development

The repository is a pnpm workspace driven by [Vite+](https://viteplus.dev) (`vp`), which wraps
the package manager, Vitest, Oxlint, Oxfmt and tsdown.

```bash
vp install        # after cloning and after every pull
vp run ready      # format, lint, type check, test and build everything
```

## Layout

| Path                                | Contents                                                |
| ----------------------------------- | ------------------------------------------------------- |
| `packages/layerscope`               | The `nuxt-layerscope` package: CLI, Nuxt module and API |
| `packages/layerscope/src/module`    | The Nuxt module that writes the registry                |
| `packages/layerscope/src/analyze`   | Loading layers and symbols, scanning files              |
| `packages/layerscope/src/scan`      | Script and template parsing                             |
| `packages/layerscope/src/rules`     | The rules                                               |
| `packages/layerscope/test/fixtures` | Nuxt projects the tests run against                     |
| `packages/docs`                     | This site (VitePress)                                   |
| `action.yml`                        | The GitHub Action                                       |

## Commands

| Command             | What it does                                               |
| ------------------- | ---------------------------------------------------------- |
| `vp check`          | Format check, lint and type check (`vp check --fix` fixes) |
| `vp test`           | All tests                                                  |
| `vp test -u`        | Update snapshots                                           |
| `vp run build`      | Build the package                                          |
| `vp run tarball`    | Build and pack the package into `.release/`                |
| `vp run dev`        | Run this site locally                                      |
| `vp run docs:build` | Build this site                                            |

`vp run tarball` gives you a `.tgz` you can install in another project to try a change before it
is released. Pull requests also get a preview build; see [Releasing](./releasing).

## Fixtures

Tests run against real Nuxt projects. A global setup runs `nuxi prepare` in each fixture first,
with the Nuxt module enabled, so both symbol sources are tested.

| Fixture  | Covers                                                                                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nuxt3`  | Nuxt 3, layers from `extends`                                                                                                                                                            |
| `nuxt4`  | Nuxt 4, `layers/*`, a workspace layer with custom `srcDir` and `serverDir`                                                                                                               |
| `matrix` | npm-installed layer, remote layer from a local git repo, `pathPrefix: false`, custom component dirs, `.client`/`.server`, islands, `shared/` utils, a component override, `@vueuse/nuxt` |

Every fixture has an expected-findings snapshot in `test/snapshots/findings`. CI runs the
`matrix` fixture on the latest Nuxt 3.x, Nuxt 4.0 and the latest 4.x; a snapshot must hold on
all of them.

If the setup fails with `"nuxi prepare" failed in the … fixture`, run `vp install`: new fixture
dependencies are the usual cause.

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org) and are a
single subject line of at most 100 characters, without a body. A pre-commit hook runs
`vp check --fix` on staged files.
