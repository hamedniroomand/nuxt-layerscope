# Continuous integration

`layerscope check` exits with `1` when there are errors, so any CI fails on new violations. Run
it after installing dependencies, and let it run `nuxi prepare` or run that yourself.

## GitHub Actions

The [GitHub Action](../reference/github-action) prints findings as annotations, so they show up
inline on the pull request diff:

```yaml [.github/workflows/layerscope.yml]
name: Layer boundaries

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  layerscope:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx nuxi prepare
      - uses: hamedniroomand/nuxt-layerscope@v0.1.0
```

Pin the action to a release tag. It runs the `nuxt-layerscope` your project installs, or the
action's `version` input through `npx` when the project does not install it.

### Drift and baseline size

The action adds a summary to each run, such as `adds 3, fixes 5` and `Baseline: 47 → 42 (−5)`, so
a team can watch the baseline shrink. Set `comment: true` (with `pull-requests: write`) to post it
on the pull request. Without the action, run
`layerscope drift --base origin/main --format markdown`.

### Without the action

The action is a thin wrapper; the command alone does the same:

```yaml
- run: npx layerscope check --prepare --format github
```

### Code scanning

The [`sarif` format](../reference/output#sarif) is stored: findings show in the Security tab of
the repository and stay there over time. The check step writes the file and exits with `1` when
there are errors, so the upload step runs with `if: always()`:

```yaml [.github/workflows/layerscope.yml]
permissions:
  contents: read
  security-events: write

jobs:
  layerscope:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx layerscope check --prepare --format sarif > layerscope.sarif
      - uses: github/codeql-action/upload-sarif@v4
        if: always()
        with:
          sarif_file: layerscope.sarif
```

Findings that the baseline accepts are uploaded as suppressed, so code scanning does not report
them as fixed. The GitHub Action covers the `github` format only.

### pnpm and monorepos

```yaml
- uses: pnpm/action-setup@v4
- uses: actions/setup-node@v6
  with:
    node-version: 24
    cache: pnpm
- run: pnpm install --frozen-lockfile
- uses: hamedniroomand/nuxt-layerscope@v0.1.0
  with:
    root: apps/shop
    prepare: true
```

`root` is the Nuxt project, relative to the repository. Run one step per app.

## Git hooks

A full check of a large project can take too long for a hook, and it shows findings in files that
were not touched. [`--staged`](../reference/cli#checking-some-files) checks only the staged files:
layerscope loads the project, reads those files, and reports the findings in them. On a project of
3,000 source files that takes about 0.3 s, against 0.8 s for the whole project (see
[Performance](./performance)).

::: code-group

```json [lint-staged: package.json]
{
  "lint-staged": {
    "*.{ts,vue,js}": "layerscope check"
  }
}
```

```json [simple-git-hooks: package.json]
{
  "simple-git-hooks": {
    "pre-commit": "npx layerscope check --staged"
  }
}
```

```bash [husky: .husky/pre-commit]
npx layerscope check --staged
```

:::

`lint-staged` adds the names of the staged files to the command, and layerscope reads them as files,
so no flag is needed. For a pre-push hook, check what the branch changed:
`npx layerscope check --changed`.

In a repository with several projects, `lint-staged` runs from the repository root and passes the
files of every package. Give the project first; files in other projects are skipped:

```json [package.json]
{
  "lint-staged": {
    "apps/web/**/*.{ts,vue}": "layerscope check apps/web"
  }
}
```

Three things to know:

- The hook needs fresh generated files. Run `nuxi prepare` after install (a `postinstall` script)
  and not `--prepare` in every hook, which is much slower.
- `--staged` picks the files from the index and reads them from the working tree. With a partly
  staged file (`git add -p`) it checks the working tree. `lint-staged` hides unstaged changes
  while it runs, so through it the check sees what will be committed.
- A hook sees only the selected files. A use of a symbol that changed, in a file that was not
  staged, is found by the full check in CI, so keep that.

## GitLab CI

The [`gitlab` format](../reference/output#gitlab) is a Code Quality report. GitLab shows it in the
merge request widget and in the diff:

```yaml [.gitlab-ci.yml]
layerscope:
  image: node:24
  script:
    - npm ci
    - npx layerscope check --prepare --format gitlab > gl-code-quality-report.json
  artifacts:
    when: always
    reports:
      codequality: gl-code-quality-report.json
```

`when: always` uploads the report when the job fails on an error. Paths in the report are
relative to the repository root, also when the Nuxt project is in a subdirectory. Unlike `sarif`,
the report leaves out findings that the baseline accepts. For the text output in the job log, run
`npx layerscope check --prepare` alone.

## Other CI systems

Anything that runs Node.js works:

```bash
npm ci
npx layerscope check --prepare --format json > layerscope.json
```

The [JSON report](../reference/output#json) is versioned and deterministic: the same input gives
the same bytes, so it can be diffed and cached.

## Recommendations

- **Commit a baseline** if the codebase has violations, so the check can be required from day
  one. See [Baseline](./baseline).
- **Turn on the cycle rule** with `rules: { 'layer-cycle': 'error' }` once the baseline holds the
  cycles you have today, and pick a [`preset`](../reference/config#preset) if your layers fit one.
- **Require the registry** once the [Nuxt module](./nuxt-module) is installed, so a broken setup
  fails loudly instead of falling back: `layerscope check --source registry`.
- **Keep `nuxi prepare` fresh.** layerscope refuses to run on generated files that are out of date
  (exit `2`), which usually means `nuxi prepare` did not run after checkout. `--prepare` avoids it.
