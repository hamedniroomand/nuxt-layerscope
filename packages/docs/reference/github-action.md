# GitHub Action

`hamedniroomand/nuxt-layerscope` runs `layerscope check --format github`, so findings are shown
inline on the pull request diff and the job fails on errors.

```yaml
- uses: hamedniroomand/nuxt-layerscope@v0.1.0
  with:
    root: .
```

The action does not install dependencies or run `nuxi prepare` for you unless asked: install
first, then either run `npx nuxi prepare` or set `prepare: true`. See
[Continuous integration](../guide/ci) for complete workflows.

## Inputs

| Input      | Default                    | Description                                                                         |
| ---------- | -------------------------- | ----------------------------------------------------------------------------------- |
| `root`     | `.`                        | Nuxt project root, relative to the repository                                       |
| `config`   |                            | Config file; defaults to `layerscope.config.*` in the root                          |
| `prepare`  | `false`                    | `true` runs `nuxi prepare` first; needs the project's dependencies installed        |
| `baseline` | `layerscope-baseline.json` | [Baseline](../guide/baseline) file, relative to the root                            |
| `version`  | `latest`                   | `nuxt-layerscope` version to run through `npx` when the project does not install it |

## Which layerscope runs

1. `<root>/node_modules/.bin/layerscope`, the version the project installs,
2. otherwise `node_modules/.bin/layerscope` at the repository root (monorepos),
3. otherwise `npx nuxt-layerscope@<version>`.

Installing `nuxt-layerscope` in the project keeps CI and local runs on the same version, and
the [Nuxt module](../guide/nuxt-module) and the CLI in step.

## Versioning

Pin the action to a release tag such as `v0.1.0`. Each release of the npm package has a matching
tag in the repository.
