# Releasing

`nuxt-layerscope` is published to npm by `.github/workflows/release.yml` when a `v*` tag is
pushed. The workflow uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers):
GitHub Actions proves its identity to npm with OIDC, so no npm token is stored anywhere, and npm
adds [provenance](https://docs.npmjs.com/generating-provenance-statements).

## Release

1. Update `version` in `packages/layerscope/package.json` and rename the `## Unreleased` section
   of `packages/layerscope/CHANGELOG.md` to `## <version>`. Changes merged between releases add
   their line under `## Unreleased`. If the DevTools tab changed, run `vp run docs#screenshots`
   and commit the pictures; `packages/docs/public/devtools/manifest.json` shows the version they
   were made for.
2. Merge that to `main`.
3. Tag `main` and push the tag:

   ```bash
   git switch main && git pull && git tag v0.2.0 && git push origin v0.2.0
   ```

The workflow then:

1. checks that the tag matches the package version,
2. runs `vp run ready` (format, lint, type check, tests, build),
3. packs the package with pnpm, which replaces the workspace's `catalog:` specifiers, and
   publishes it with npm 11.5.1 or later through trusted publishing,
4. creates the GitHub release from the changelog section.

A tag with a pre-release suffix, such as `v0.3.0-beta.1`, is published under the `next` dist-tag
and marked as a pre-release on GitHub.

The GitHub Action is referenced by tag (`hamedniroomand/nuxt-layerscope@v0.2.0`), so every
release needs its tag.

## Try a change before it is released

Nothing here publishes to npm.

**Preview build.** `.github/workflows/preview.yml` publishes every pull request and every push to
`main` with [pkg.pr.new](https://pkg.pr.new). Install one in any project:

```bash
npx https://pkg.pr.new/nuxt-layerscope@<pr-number-or-sha>
pnpm add -D https://pkg.pr.new/nuxt-layerscope@<pr-number-or-sha>
```

**Local tarball.** To test a change that is not pushed yet, `vp run tarball` builds the package
and packs it into `.release/`, which is git-ignored:

```bash
pnpm add -D /path/to/nuxt-layerscope/.release/nuxt-layerscope-<version>.tgz
```

## One-time setup

Already done for this repository; kept for reference, or for a fork.

A trusted publisher can only be configured for a package that exists, so the first version has to
be published by hand (`vp pm pack`, then `npm publish --access public` on the tarball, with the
Release workflow disabled). After that, on
[npmjs.com](https://www.npmjs.com/package/nuxt-layerscope), open **Settings → Trusted
publishing**, choose **GitHub Actions** and enter:

| Field                | Value             |
| -------------------- | ----------------- |
| Organization or user | `hamedniroomand`  |
| Repository           | `nuxt-layerscope` |
| Workflow filename    | `release.yml`     |
| Environment name     | `npm`             |

The environment must match `environment: npm` in the workflow. Create it on GitHub under
**Settings → Environments**; protection rules there (required reviewers, only `v*` tags) apply to
every publish. Then restrict publishing on npm under **Settings → Publishing access → Require
two-factor authentication and disallow tokens**: trusted publishing keeps working, and a leaked
token can no longer publish.

The preview workflow needs the [pkg.pr.new GitHub App](https://github.com/apps/pkg-pr-new)
installed on the repository.
