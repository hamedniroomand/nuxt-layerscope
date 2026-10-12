# GitHub Action

`hamedniroomand/nuxt-layerscope` runs `layerscope check --format github`, so findings are shown
inline on the pull request diff and the job fails on errors.

```yaml
- uses: hamedniroomand/nuxt-layerscope@v0
  with:
    root: .
```

`@v0` follows the newest 0.x release. To pin a release, use a full tag such as `@v0.4.0`.

The action does not install dependencies or run `nuxi prepare` for you unless asked: install
first, then either run `npx nuxi prepare` or set `prepare: true`. See
[Continuous integration](../guide/ci) for complete workflows.

## Inputs

| Input      | Default                    | Description                                                                                                                                             |
| ---------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `root`     | `.`                        | Nuxt project root, relative to the repository                                                                                                           |
| `config`   |                            | Config file; defaults to `layerscope.config.*` in the root                                                                                              |
| `prepare`  | `false`                    | `true` runs `nuxi prepare` first; needs the project's dependencies installed                                                                            |
| `baseline` | `layerscope-baseline.json` | [Baseline](../guide/baseline) file, relative to the root                                                                                                |
| `comment`  | `false`                    | `true` posts the drift report as a pull request comment, one for each root; needs `pull-requests: write`. Skipped on a `pull_request` event from a fork |
| `version`  | `latest`                   | `nuxt-layerscope` version to run through `npx` when the project does not install it                                                                     |

## Drift summary

After the check, the action runs [`layerscope drift`](./cli#layerscope-drift) against the base commit
and writes the result to the job summary: how many violations the change adds and fixes, and how the
baseline size changed. On a pull request, it compares with the latest commit of the base branch. On a
push, it compares with the commit before the push. In a merge queue, it compares with the base
commit of the merge group. If the clone does not have that commit, the step fetches it. If the step
cannot fetch it, if git cannot run in the root, or if the event has no base commit (for example a
push of a new branch, or a manual run), the step skips the report and prints a notice.
The step never fails the job. If `drift` fails, for example because the baseline on the base branch
is not valid, the step prints the error in its log and writes no summary.

With `comment: true`, the action also posts the report as a pull request comment, one comment for
each root. Later runs update the comment that the same account wrote. Two steps or workflows with
the same root and the same account share one comment. If the action cannot find, update or post the
comment, it prints a warning. If drift succeeds, the job summary still has the report. If drift fails, the comment
says so. If the step skips the report, the old comment stays as it is.

On a `pull_request` event from a fork, the token is read-only, so the action skips the comment and
prints a notice. With `pull_request_target`, the action posts the comment. A Dependabot pull request
also has a read-only token: the action prints a warning.

## Outputs

| Output    | Description                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------- |
| `comment` | What the action did with the pull request comment: `created`, `updated`, `skipped` or `failed`. |

## Which layerscope runs

1. `<root>/node_modules/.bin/layerscope`, the version the project installs,
2. otherwise `node_modules/.bin/layerscope` at the repository root (monorepos),
3. otherwise `npx nuxt-layerscope@<version>`.

Installing `nuxt-layerscope` in the project keeps CI and local runs on the same version, and
the [Nuxt module](../guide/nuxt-module) and the CLI in step.

## Versioning

Pin the action to a release tag such as `v0.1.0`. Each release of the npm package has a matching
tag in the repository.
