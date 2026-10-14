# CLI

The package installs a `layerscope` command. Without installing, run it as
`npx nuxt-layerscope`.

```bash
layerscope <command> [options]
```

| Command                                  | Description                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`init [root]`](#layerscope-init)        | Write a starter config from today's dependencies                                           |
| [`drift [root]`](#layerscope-drift)      | Say how many errors the code adds and fixes                                                |
| [`fix [root]`](#layerscope-fix)          | Print or make the file moves that fix boundary findings (only moves, no other suggestions) |
| [`check [root]`](#layerscope-check)      | Check layer boundaries, including auto-imports                                             |
| [`why <symbol> [root]`](#layerscope-why) | List every use of a symbol and the layers it crosses                                       |
| [`graph [root]`](#layerscope-graph)      | Print the dependency graph between layers or files                                         |
| [`unused [root]`](#layerscope-unused)    | List components and auto-imports nothing references                                        |

`root` is the Nuxt project root and defaults to the current directory. `layerscope --help` and
`layerscope <command> --help` print the options.

## `layerscope init`

```bash
layerscope init [root] [options]
```

Writes `layerscope.config.ts` with every layer and the smallest `allow` map under which the project
passes. It prints the layers, every allowed edge and a readiness report: how many references could
not be resolved and where they cluster. Project code is never changed. See
[Getting started](../guide/getting-started#generate-a-starting-config).

When a [preset](./config#preset) allows every dependency that exists, `init` also names it. It can
suggest a preset with `root` as its base, for example `preset: { name: 'features', base: ['root'] }`,
for the usual shape: shared code in root, and feature layers that use only root. Root is restricted
under such a preset, so it fits only when root uses no other layer. When a plain preset
fits, `init` suggests it, because it is stricter.

| Option            | Default               | Description                                                                                                                                      |
| ----------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--config <file>` | `layerscope.config.*` | Where to write the config, relative to the current directory. By default, the existing config file, or `layerscope.config.ts` when there is none |
| `--baseline`      |                       | Also write a baseline of the findings still reported                                                                                             |
| `--force`         |                       | Replace the existing config file or baseline                                                                                                     |
| `--dry-run`       |                       | Print the proposal and write nothing                                                                                                             |

Also takes `--prepare`, `--source` and `--verbose`. Without `--force`, `init` exits `2` when a
config already exists, or a baseline with `--baseline`. It does not merge: use `--dry-run` and copy
the edges you want.

With `--force`, `init` replaces the config file that exists, whatever its name. Without `--config`,
it does not write a second config.

`init` reads Nuxt's data from the build directory. It takes `buildDir` from the layerscope config if
there is one, then from `nuxt.config`, and uses `.nuxt` if neither sets it. When the build directory
is not `.nuxt`, the new config sets `buildDir`, so `check` reads the same place.

`init` also exits `2` when the `layerscope` key of `nuxt.config` sets options, and it names the keys.
It reads the data that Nuxt recorded in the build directory. After you move the keys to `layerscope.config.ts`
and remove the key, run `layerscope init --prepare --dry-run` and copy the layers and edges you
need. Do not use `--force` for this: it replaces the config, and the keys that you moved are lost.

With `--source auto` (the default), `init` prints a note on stderr after the summary when it finds
no registry file in Nuxt's build directory (by default `.nuxt/layerscope/registry.json`). The module
is not installed or not enabled, or Nuxt did not run since it was added. In most projects both
sources give the same boundary findings, so the config that `init` wrote stays valid. If the
findings change after you install the module, run `layerscope init --dry-run` and compare. See
[Why use it](../guide/nuxt-module#why-use-it).

## `layerscope check`

```bash
layerscope check [root] [files...] [options]
```

| Option              | Default                    | Description                                                                                                                                                                                                                                                |
| ------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--format <format>` | `text`                     | [Output format](./output): `text`, `github`, `json`, `sarif` or `gitlab`                                                                                                                                                                                   |
| `--config <file>`   | `layerscope.config.*`      | Config file, relative to the current directory                                                                                                                                                                                                             |
| `--prepare`         |                            | Run `nuxi prepare` before checking                                                                                                                                                                                                                         |
| `--source <source>` | `auto`                     | [Symbol source](#source): `auto`, `registry` or `types`                                                                                                                                                                                                    |
| `--baseline <file>` | `layerscope-baseline.json` | [Baseline](../guide/baseline) file, relative to the root                                                                                                                                                                                                   |
| `--update-baseline` |                            | Write every current finding to the baseline file and exit `0`                                                                                                                                                                                              |
| `--watch`           |                            | Check again after each change, until Ctrl+C. See [Watch mode](../guide/editor#watch-mode)                                                                                                                                                                  |
| `--staged`          |                            | Check only the files staged for commit. See [Git hooks](../guide/ci#git-hooks)                                                                                                                                                                             |
| `--changed`         |                            | Check only the files that changed since the default branch, and untracked files                                                                                                                                                                            |
| `--since <ref>`     |                            | Check only the files that changed since the merge base with a git ref (implies `--changed`)                                                                                                                                                                |
| `--summary <file>`  |                            | Write the count and the list of the findings to a file, relative to the current directory, as Markdown, up to 200 findings. Use it only with `--format github`. When there is no finding, the file is empty. The GitHub Action uses it for the job summary |
| `--verbose`         |                            | Print where symbols were read from                                                                                                                                                                                                                         |

```bash
layerscope check                                  # current directory
layerscope check apps/shop --format github        # another root, GitHub annotations
layerscope check --prepare --source registry      # regenerate, and require the module
layerscope check --update-baseline                # accept the current findings
layerscope check --watch                          # check again after each save
layerscope check --staged                         # only what is staged for commit
layerscope check --since origin/main              # only what changed since a ref
layerscope check src/a.ts src/b.vue               # only these files
layerscope check --format github --summary out.md # also write the list of the findings
layerscope check apps/web apps/web/src/a.ts       # a root first, then files
```

The summary lists errors and warnings. It does not list the removable baseline entries. `--summary`
does not work with `--watch` or `--update-baseline`.

### Checking some files

`--staged`, `--changed`, `--since` and file arguments select files. layerscope still loads the
whole project to resolve symbols, but it reads only the selected files, and reports only the
findings in them. That is much less work than a full check, which makes it fit for a pre-commit
hook.

- **Arguments.** A first argument that is a directory is the root, as before, and the rest are
  files. When no argument is a directory, all arguments are files and the root is the working
  directory; this is how `lint-staged` calls a command. Paths may be relative to the working
  directory or absolute.
- **Files outside the project root.** `--staged`, `--changed` and `--since` select only files
  inside the project root. A file in a `srcDir`, `serverDir` or shared dir outside the root is not
  selected by them: give its path as a file argument, or run `layerscope check`.
- **`--staged`** takes the files that are added, copied, modified or renamed in the index.
  **`--changed`** takes the files that differ from the merge base with the default branch
  (`origin/HEAD`, else `main`, else `master`) in the working tree, committed or not, and the
  untracked files. On the default branch itself it takes the uncommitted work and the commits that are not on `origin` yet, so it also fits a pre-push hook. Without a remote it takes only the uncommitted work. **`--since <ref>`**
  uses another ref: the files that differ from the merge base of `HEAD` and the ref, so work that
  landed on the ref after your branch left it is not checked. Without a merge base, the ref itself
  is used. Before the first commit, every file in the index is new. In a repository with several projects, `git` is asked from the project root,
  so only files of that project are selected.
- **A shallow checkout.** `--changed` needs the default branch in the clone. When no default
  branch has a merge base with `HEAD`, as in a CI checkout with `fetch-depth: 1`, the command exits
  `2` with a hint and does not guess. Fetch the base branch (`actions/checkout` with
  `fetch-depth: 0`), or pass `--since <ref>`.
- **Skipped files.** A selected file that is not a source file of a layer (outside the project, in
  no layer, ignored) is skipped, and a note on stderr counts them. Nothing selected exits `0` at
  once with a short message, before the project loads; `--format json`, `sarif` and `gitlab` still
  print a valid, empty report.
- **The baseline** applies. A fixed baseline entry is reported only for a selected file, because a
  check of some files cannot tell whether the entries of other files are fixed. A `layer-cycle` entry
  is never reported as fixed in such a run, because it is not tied to one file.
- **What it does not see.** A use of a symbol that changed, in a file that is not selected, is not
  found; a full `layerscope check` (in CI) covers it. A check of some files gives no fix
  suggestions either, because they need the dependencies of every file. With the
  [`layer-cycle`](./rules#layer-cycle) rule on, every file is scanned, because a cycle needs every
  dependency, and only the findings in the selected files are shown.
- **Exit codes** are those of a full check. `--staged`, `--changed`, `--since` and file arguments
  cannot be combined with each other, with `--update-baseline` or with `--watch`.

## `layerscope drift`

```bash
layerscope drift [root] [--base origin/main] [--format text|markdown|json]
```

Compares the errors that the code has now with the [baseline](../guide/baseline) committed on the
base ref, and prints `adds 3, fixes 5`, the entries behind both, and the baseline size on the base
and now.

Only the rules that the current config sets to `error` count, on both sides. Warnings do not
count. Warnings do not fail `check`, so they can get to the base branch without a baseline entry.
`drift` does not analyze the code on the base. So:

- An error counts as added when the base baseline does not have it. This is also true for an error
  that was already on the base, for example when `check` fails on the base, or when the current
  config changes a rule from `warn` to `error`.
- An entry of the base baseline counts as fixed when the code does not have it now. This is also
  true for an entry that was fixed on the base without `--update-baseline`.
- If the current config sets a rule to `warn` or `off`, the entries of that rule do not count as
  added or fixed.

The baseline size counts all entries, warnings too. So it can change when `adds` and `fixes` do
not. A base without a baseline file counts as empty. The baseline file must be in the git
repository. A baseline that is a symbolic link on the base ref stops `drift` with an error. A
baseline file that is not valid stops `drift` with an error, on the base ref and in the working
tree.

Also takes `--baseline`, `--config`, `--prepare` and `--source`. Exits `0`. Exits `2` for a root
that is not in a git work tree, an unknown ref, an invalid baseline, a baseline outside the git
repository, or a baseline that is a symbolic link on the base ref.

## `layerscope fix`

```bash
layerscope fix [root] (--dry-run | --apply) [options]
```

Prints, or with `--apply` makes, the file moves asked for by the [suggestions](./rules#suggestions)
on boundary findings. For each move it lists the explicit imports that the move breaks, with their
new specifier. Auto-imports and components need no update.

`fix` lists only the imports that must change. A relative specifier is listed with its new
specifier. An alias (such as `#layers/...` or `~~/...`) is listed as "update by hand". This is only
for an alias that points at a file that moves. An alias that points at the same file after the
move is not listed.

Findings that have no move are counted in one line. Run `layerscope check` to see their
suggestions.

After `--apply`, run `layerscope check --prepare`. After `--dry-run`, make the moves and update the
imports yourself, then run `layerscope check --prepare`. The generated types still point at the old
files. `check` and `fix` do not read test files, `nuxt.config.*`, the Nuxt `modules/` dir, files
outside the layer source dirs, or files that match `ignore`. Update the imports of moved files in
them by hand. With `typeImports: 'ignore'`, type-only imports are not listed either.

Baseline entries that name a moved file are counted in one line. A baseline key holds file paths. A
finding in a moved file, or a finding that points at a moved file, gets a new key after the move, so
its old entry no longer matches. A move that clears a finding makes its entry unused. `layer-cycle`
entries are not counted. Update these entries in the baseline file, or run
`layerscope check --update-baseline` if you want to accept all current findings. `fix` does not
change the baseline file.

`--apply` makes the steps in this order: it writes the new text of each file that has an import to
change, then it moves each file. A tracked file moves with `git mv`, so that git keeps its history.
It rewrites the relative imports in the importers and in the moved file. It does not change
aliases: they are listed to update by hand.

Before the first change, `--apply` makes these git checks:

- The root is in a git repository, and the git working tree of the repository has no changes and no
  untracked files.
- Git tracks each file to move and each file to edit, and none is marked assume-unchanged or
  skip-worktree.
- No file to move, file to edit or target path is in a git submodule, and no target path is in
  another git repository.
- Git can make each move of a tracked file. For example, git refuses a target outside a sparse
  checkout.

`--allow-dirty` skips these checks. With it, a file that git does not track, and a move that git
refuses because of a sparse checkout, use a plain rename. Another error of git, such as a lock,
stops the run with `--allow-dirty` too.

It also makes these checks, always:

- Each file to move is still a file.
- Each file to edit can be written and is UTF-8 text. It still has the old import at the place the
  plan says.
- No file to move or edit, and no target dir, has a symbolic link in its path or is outside the
  repository (when there is one).
- No file to move or edit has more than one hard link.
- No target path exists, no two moves have the same target, and no target differs only in letter
  case from another target or from a file in its folder.
- Each new specifier can be written in the quotes of the old one.

If a check fails, nothing is changed, and each reason is listed.

If a step fails (a write or a move), `--apply` stops. It prints the reason, what is done and what is not, and then tells
you to run `git status` and `git diff` and to use git to undo the changes. The check for a clean
tree is there so that `git status` and `git diff` show only the changes of `--apply`. With
`--allow-dirty`, git can also show changes from before, and it can miss some changes of `--apply`.
If the project is not in git, the lists are the only record of the changes.

Use `--dry-run` or `--apply`, not both and not none. `--dry-run` moves nothing. Findings that
`--baseline` accepts are skipped, as in `check`. Options: `--baseline`, `--config`, `--prepare`,
`--source`, `--verbose` and, with `--apply`, `--allow-dirty`.

## `layerscope why`

```bash
layerscope why <symbol> [root] [options]
```

`symbol` is an auto-import (`useCart`), a component (`BaseButton`, `base-button`,
`LazyBaseButton`) or an import specifier (`#layers/web/app/composables/useCart`). See
[Explore dependencies](../guide/explore#trace-a-symbol-with-why).

| Option              | Default               | Description                        |
| ------------------- | --------------------- | ---------------------------------- |
| `--format <format>` | `text`                | `text` or `json`                   |
| `--config <file>`   | `layerscope.config.*` | Config file                        |
| `--prepare`         |                       | Run `nuxi prepare` first           |
| `--source <source>` | `auto`                | Symbol source                      |
| `--verbose`         |                       | Print where symbols were read from |

## `layerscope graph`

```bash
layerscope graph [root] [options]
```

Dependencies between layers or between files inside layers; packages are left out. Edges that
break the layer rules are red, and an edge carrying several references is labelled with the count.

| Option              | Default   | Description                                                  |
| ------------------- | --------- | ------------------------------------------------------------ |
| `--format <format>` | `mermaid` | `mermaid`, `dot` or `json`                                   |
| `--by <level>`      | `layer`   | `layer`, or `file` for files grouped in a subgraph per layer |

Also takes `--config`, `--prepare`, `--source` and `--verbose`. Exits `0`.

```bash
layerscope graph > layers.mmd
layerscope graph --by file --format dot | dot -Tsvg > files.svg
```

## `layerscope mcp`

```bash
layerscope mcp [root] [options]
```

Starts an [MCP server](../guide/coding-tools#mcp-server) over stdio for coding assistants. It reads
JSON-RPC from stdin and writes only JSON-RPC to stdout; notes and errors go to stderr. It ends when
stdin closes or on `SIGINT` and `SIGTERM`, with exit code `0`.

| Option              | Default                    | Description                                                                              |
| ------------------- | -------------------------- | ---------------------------------------------------------------------------------------- |
| `--config <file>`   | `layerscope.config.*`      | Config file, relative to the current directory                                           |
| `--prepare`         |                            | Run `nuxi prepare` once, before the server starts; it writes the generated `.nuxt` files |
| `--source <source>` | `auto`                     | [Symbol source](#source): `auto`, `registry` or `types`                                  |
| `--baseline <file>` | `layerscope-baseline.json` | [Baseline](../guide/baseline) file, relative to the root                                 |
| `--verbose`         |                            | Print where symbols were read from                                                       |

A problem with the project (a config error, a missing registry) does not stop the server: the
tool call that hits it returns the message, and the next call tries again.

## `layerscope unused`

```bash
layerscope unused [root] [options]
```

Components and auto-imports (app, server and shared) registered by the project's own layers that
nothing references. An explicit import of a file counts as using all of its exports. If any file
renders a component chosen at runtime, unused components are marked "possibly used at runtime".

`unused` does not count uses in test files, in files that match [`ignore`](./config#ignore), or in
layers installed as packages. Test files are `*.test.*`, `*.spec.*` and `__tests__/`. A file outside
the layer source dirs is not read when it is not in an extra auto-import or component dir and no
counted file imports it. `unused` also counts the uses in `nuxt.config.*`, in the Nuxt `modules/`
dir, in files of extra auto-import and component dirs, and in the project files that counted files
import. It also counts `typeof x` in a type, and `import type` when `typeImports` is `'ignore'`. The
text report has a line that names the uses that it does not count. `unused` does not list the
symbols of layers outside the project root that are not installed as packages, for example workspace
packages, because another app can use them. When such layers exist, a second line names them.

After the symbols, it lists each file that it could not read in full. These are files with a parse
error, a template that layerscope does not read (a `lang` other than HTML, a `src` attribute, or an
expression that does not parse), an `import()` or `require()` with a path that is not a fixed
string, or an `import.meta.glob()`. `unused` can miss some uses in these files. When there are such
files, the report does not say that every symbol is referenced. The JSON report has the same data in
`blindSpots` (see [`unused` output](./output#unused-output)). The [explore
guide](../guide/explore#find-unused-code) lists every use that `unused` does not see.

`why` shows only the uses that `check` reads. A use that only `unused` counts, for example in
`nuxt.config.ts`, does not show in `why`.

| Option              | Default | Description      |
| ------------------- | ------- | ---------------- |
| `--format <format>` | `text`  | `text` or `json` |

Also takes `--config`, `--prepare`, `--source` and `--verbose`. Exits `0`.

## `--source`

| Value      | Behavior                                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto`     | The [module's registry](../guide/nuxt-module) when it exists and is current, otherwise the generated `.d.ts` files                                              |
| `registry` | The registry; exit `2` when it is missing, from an incompatible version, or from an older release that lacks data this release needs (run `nuxi prepare` again) |
| `types`    | The generated `.d.ts` files, even when a registry exists                                                                                                        |

## Exit codes

Every command works with flags only and never prompts, so it is safe in scripts, CI and for
[coding assistants](../guide/coding-tools).

| Code | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | No errors (warnings do not fail), a baseline was written, `why` found the symbol, or `init`/`drift`/`fix`/`graph`/`unused` ran                                                                                                                                                                                                                                                                                                    |
| `1`  | `check` found at least one error that is not in the baseline                                                                                                                                                                                                                                                                                                                                                                      |
| `2`  | Config or input problem: invalid config, unknown layer, missing or stale generated files, a component or auto-import dir that layerscope cannot open, a file that the generated types refer to that layerscope cannot reach, `why` found no use, invalid baseline file, a `drift` baseline that is outside the git repository or is a symbolic link on the base ref, empty `--baseline` value, a refused or stopped `fix --apply` |

## Output streams

The report goes to stdout. Everything else goes to stderr, prefixed with `layerscope:`, except the
stop report of `fix --apply`, which has no prefix. This is errors, notes (such as a rule that could
not run or a `nuxt.config` newer than the registry) and the `--verbose` line. Notes are printed
after the report, so they are the last thing on screen.
Redirecting stdout always gives a clean report:

```bash
layerscope check --format json > report.json
```
