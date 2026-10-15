# GitHub Action

`hamedniroomand/nuxt-layerscope` runs `layerscope check --format github`, so findings are shown
inline on the pull request diff and the job fails on errors (and on fixed baseline entries with
`strict-baseline`, and on baseline growth with `fail-on-growth`). GitHub shows at most 10 error and
10 warning annotations for each step. The job summary lists the findings, up to 200.

```yaml
- uses: hamedniroomand/nuxt-layerscope@v0
  with:
    root: .
```

`@v0` follows the newest 0.x release. To pin a release, use a full tag (see [Versioning](#versioning)).

The action does not install dependencies or run `nuxi prepare` for you unless asked: install
first, then either run `npx nuxi prepare` or set `prepare: true`. See
[Continuous integration](../guide/ci) for complete workflows.

## Inputs

| Input             | Default                                                                                                             | Description                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `root`            | `.`                                                                                                                 | Nuxt project root, relative to the repository                                                                                                                                                                                                                                                                                                                            |
| `config`          |                                                                                                                     | Config file, relative to the root; defaults to `layerscope.config.*` in the root                                                                                                                                                                                                                                                                                         |
| `prepare`         | `false`                                                                                                             | `true` runs `nuxi prepare` first; needs the project's dependencies installed                                                                                                                                                                                                                                                                                             |
| `baseline`        |                                                                                                                     | [Baseline](../guide/baseline) file, relative to the root. It must be in the git repository. Defaults to the [`baseline`](./config#baseline) key of the config, else `layerscope-baseline.json`                                                                                                                                                                           |
| `strict-baseline` | `false`                                                                                                             | Fail the check when the baseline has fixed entries (entries that no finding matches). Then run "layerscope check --update-baseline" and commit the file. The version of `nuxt-layerscope` that the action runs must be 0.10.0 or later.                                                                                                                                  |
| `fail-on-growth`  | `false`                                                                                                             | Fail the job when the drift report shows errors that the baseline at the base does not have, also when the change adds them to the baseline. Turn it on after the baseline file is on the base branch. Also fail when the report cannot be made, except for an event with no base commit. The version of `nuxt-layerscope` that the action runs must be 0.10.0 or later. |
| `comment`         | `false`                                                                                                             | `true` posts the drift report as a pull request comment, one for each root; needs `pull-requests: write`. Skipped on a `pull_request` event from a fork                                                                                                                                                                                                                  |
| `version`         | the version of the action release (for `@main` or a commit, the version in `action.yml`, normally the last release) | `nuxt-layerscope` version to run through `npx` when the project does not install it                                                                                                                                                                                                                                                                                      |

## Drift summary

The check step writes its own section, `layerscope findings`, to the job summary when there are
findings, or fixed baseline entries with `strict-baseline`. After the check, the step
`Build the drift report` runs [`layerscope drift`](./cli#layerscope-drift) against the base commit
and writes the result to the job summary: how many errors the change adds and fixes, and how the
baseline size changed. Only errors count in `adds` and `fixes`. A renamed file with accepted
violations does not count as added and fixed when `drift` follows the rename. See the
[baseline guide](../guide/baseline#what-counts-as-the-same-finding) for the limits. The baseline
size counts all entries, warnings too. On a pull request, it compares with the latest commit of the
base branch. On a push, it compares with the commit before the push. In a merge queue, it compares
with the base commit of the merge group. If the clone does not have that commit, the step fetches
it. If the step cannot fetch it, if git cannot run in the root, or if the event has no base commit
(for example a push of a new branch, or a manual run), the step skips the report and prints a
notice. The step never fails the job. If `drift` fails, for example because the baseline on the base
branch is not valid, is a symbolic link, the baseline file is outside the git repository, or git
cannot list the renamed files, the step prints the error in its log and writes no summary. With
`fail-on-growth`, a last step fails the job when the report shows growth, after the comment is
posted. It also fails when the report could not be made, except for an event with no base commit.

With `comment: true`, the step `Post the drift comment` also posts the report as a pull request comment, one comment for
each root. Later runs update the comment that the same account wrote. Two steps or workflows with
the same root and the same account share one comment. If they run at the same time, each can post its own comment. If the action cannot find, update or post the
comment, it prints a warning. If drift succeeds, the job summary still has the report. If drift fails, the comment
says so. If the step skips the report, the old comment stays as it is.

On a `pull_request` event from a fork, the token is read-only, so the action skips the comment and
prints a notice. With `pull_request_target`, the action posts the comment. A Dependabot pull request
also has a read-only token: the action prints a warning.

The action does not give its token to the steps that run the CLI. A token that your workflow sets in
the workflow or job env still reaches the CLI. This is not full isolation: code that runs in the job
can still get the token, for example from the git config that `actions/checkout` keeps (unless you
set `persist-credentials: false`), or through a later step. Do not run untrusted code in a job that
has write permissions or secrets.

## Outputs

| Output    | Description                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------- |
| `comment` | What the action did with the pull request comment: `created`, `updated`, `skipped` or `failed`. |

## Which layerscope runs

1. `<root>/node_modules/.bin/layerscope`, the version the project installs,
2. otherwise `node_modules/.bin/layerscope` at the repository root (monorepos),
3. otherwise `npx nuxt-layerscope@<version>`.

The action runs `check --summary`, which needs `nuxt-layerscope` 0.8.0 or later. The version that
the project installs and the `version` input must be 0.8.0 or later. An older version stops the
check step with exit code 2. With `strict-baseline: true` or `fail-on-growth: true`, both versions
must be 0.10.0 or later.

Installing `nuxt-layerscope` in the project keeps CI and local runs on the same version, and
the [Nuxt module](../guide/nuxt-module) and the CLI in step.

## Versioning

Pin the action to a release tag. From the first release after 0.7.0, a full tag such as `vX.Y.Z`
also runs `nuxt-layerscope` X.Y.Z when the project does not install it. Older tags run the newest
version. `@v0` follows the newest 0.x release, so it runs that release.
