# Changelog

## 0.7.0

### Minor Changes

- [#137](https://github.com/hamedniroomand/nuxt-layerscope/pull/137) [`91a4ae1`](https://github.com/hamedniroomand/nuxt-layerscope/commit/91a4ae171c6cf6a7de1ba1c65cfa51273ac32793) - `fix --apply` makes the planned moves. It uses `git mv` for a file that git tracks, and it rewrites the relative imports in the importers and in the moved file.

  Before the first change, it checks the plan again. It stops, and changes nothing, when:

  - the git working tree has changes or untracked files, or the root is not in a git repository;
  - git does not track a file to move or edit, or a file is in a submodule;
  - a file is marked assume-unchanged or skip-worktree, a target is outside the git repository or in another repository, or two moves have the same target;
  - a file or a target dir has a symbolic link in its path, or a file has more than one hard link;
  - a file to edit is not UTF-8 text, or is not what the plan says;
  - a target path exists, or two target paths differ only in letter case;
  - git would refuse a move, for example a target outside a sparse checkout.

  See the CLI reference for all checks.

  `--allow-dirty` skips the git checks (repository, clean tree, tracked files, submodules). If a step fails, `fix` stops and lists what is done and what is not. It then tells you to use `git status` and `git diff` to see the changes and git to undo them. `fix` needs one of `--dry-run` and `--apply`, not both. `--allow-dirty` works only with `--apply`. `fix` also counts the baseline entries that name a moved file, because they do not match after the move.

- [#125](https://github.com/hamedniroomand/nuxt-layerscope/pull/125) [`78508c0`](https://github.com/hamedniroomand/nuxt-layerscope/commit/78508c0aff89ab74a9d33a2041f61a76e057483a) - `fix` plans moves that you can trust more. The root layer can be a move target. A target must permit every user and each dependency of the file, with `allow` and `expose`. The new path is checked: no file is there, no other move uses it, and Nuxt finds the file there. A move that breaks `check` together with another move is dropped. `fix` lists only the imports that change, and keeps the extension, the query and the `index` style of each specifier. It uses the baseline, and it has the new `--baseline` option. The footer says to run `layerscope check --prepare`, and one line counts the findings that have no move. The SARIF and GitLab reports now have the suggestion of each finding. The `leave` suggestion for a use of a feature layer by `root` says to change the code.

- [#122](https://github.com/hamedniroomand/nuxt-layerscope/pull/122) [`ca4f916`](https://github.com/hamedniroomand/nuxt-layerscope/commit/ca4f91656553d1e18488d40b5721d33c6b247b38) - check now reads TypeScript syntax in a template when the component has a TypeScript script. It reports code that it cannot read as unresolved-reference findings: a template that it cannot parse, a template with a lang other than HTML or with src, a dynamic import() or require(), and import.meta.glob(). It no longer drops this code silently. An import() or require() with a template literal that has no ${} is now read as a fixed path, so it can give new layer-boundary findings.

- [#128](https://github.com/hamedniroomand/nuxt-layerscope/pull/128) [`3fc449a`](https://github.com/hamedniroomand/nuxt-layerscope/commit/3fc449aad7e6714f628a583c5d60cc542c4b89c8) - layerscope now checks files in dirs named `modules` that are not the Nuxt modules dir, for example `app/modules/` in Nuxt 4 and `server/modules/`. Before, it skipped a `modules/` or `public/` dir at the top of each scanned dir. Now it skips only the `modules` and `public` dirs that Nuxt uses for each layer (`dir.modules` and `dir.public`). A `layerscope.config.*` file is now skipped only in the layer root, so such a file in `app/` or `server/` is checked. layerscope can report new findings in these dirs, for example layer-boundary and unused findings. Review them, or update your baseline.

  `registry.json` now stores the `modules` and `public` dirs of each layer. Run `nuxi prepare` once after you update. Until then, `check` and `unused` read the generated `.d.ts` files, `--source registry` stops with an error, and the ESLint and oxlint plugins do not load the project.

- [#134](https://github.com/hamedniroomand/nuxt-layerscope/pull/134) [`c727c6d`](https://github.com/hamedniroomand/nuxt-layerscope/commit/c727c6d8ca6d3888862fec8f1c97b68948fcfdbe) - layerscope now checks the files in a `serverDir`, `srcDir` or shared dir outside the layer root, for example `serverDir: '../api'`. Before, `check`, `unused` and the ESLint and oxlint plugins skipped them with no note. An import of such a file counted as an import from outside every layer. layerscope can report new findings in these files, for example layer-boundary and unused findings. Review them, or update your baseline. `check --watch` now also watches such a dir.

  A file outside the project root has a path that starts with `../` in reports and in the baseline. For a file outside its layer root, the path that the `only` and `expose` globs match starts with `../` too, for example `../api/utils/**`. A source dir that is outside its layer root but inside the project root now belongs to its layer, not to the root layer. In ESLint and oxlint, set the `root` option for files outside the project root.

- [#124](https://github.com/hamedniroomand/nuxt-layerscope/pull/124) [`92ff133`](https://github.com/hamedniroomand/nuxt-layerscope/commit/92ff13379742ac5f814508ce835e4c7362f3e512) - A baselined layer cycle now stays accepted when the file of its first use changes. This is the case when you delete that file, or add a use in a file that sorts earlier. A `layer-cycle` entry in the baseline now matches by its chain of layers, not by its file. Old baselines still match, with one exception. layerscope now picks the cycle in a fixed way. When two cycles of the same length go through one layer, it always shows the same one. In that case layerscope can report a baselined cycle as new once after the upgrade. Run `layerscope check --update-baseline` to accept it. Entries for the same cycle in an old baseline are merged into one entry with a `count`. The text output no longer adds the target layer to a cycle entry. The SARIF and GitLab fingerprints of `layer-cycle` findings change once.

### Patch Changes

- [#132](https://github.com/hamedniroomand/nuxt-layerscope/pull/132) [`6d4db9f`](https://github.com/hamedniroomand/nuxt-layerscope/commit/6d4db9f87892df5e0860e5bcc19f5bf2aed7bb42) - layerscope now names the file in every error about an invalid baseline file: an empty file, a file that is not JSON, or a directory. A file from a newer layerscope now tells you to update layerscope, not to create the file again. `drift` now stops with an error when the baseline at the base ref is an empty file, is not JSON, or is a directory. Before, it read such a file as an empty baseline, and every finding showed as added. `--baseline ""` is refused with a clear message. A baseline file that cannot be read, for example because of its permissions, now stops the run with an error. Before, it was read as no baseline.

- [#131](https://github.com/hamedniroomand/nuxt-layerscope/pull/131) [`59c4a75`](https://github.com/hamedniroomand/nuxt-layerscope/commit/59c4a750ac448a6f29ff8db4e557aadc5c3fcda0) - `fix` lists each import of a moved file, also when a file imports the same file more than once. Before, it listed only the first import. The suggestion of `check` (also `suggestion.impact.imports` in JSON output and the MCP `suggest` tool) now counts each import to update, so the number can be higher than before. `fix --dry-run` now shows the column of each import.

- [`a7328a2`](https://github.com/hamedniroomand/nuxt-layerscope/commit/a7328a2e16e19a881fad5e340555b5680eaa9b8f) - `init --dry-run`, `check --update-baseline` and `fix --dry-run` now work when you write the flag before the root. Before, the flag took the root as its value, so the command did not use the root. `init --dry-run app` worked on the current dir, and it could write `layerscope.config.ts` there. `check --update-baseline app` checked the current dir and wrote no baseline. `fix --dry-run app` stopped with an error.

## 0.6.3

### Patch Changes

- [#101](https://github.com/hamedniroomand/nuxt-layerscope/pull/101) [`11f0229`](https://github.com/hamedniroomand/nuxt-layerscope/commit/11f022934aa6d6b133d087e1587c4d26c1bab7e2) - `init` uses the Nuxt build directory and treats every layerscope config file name the same.

- [#99](https://github.com/hamedniroomand/nuxt-layerscope/pull/99) [`30e2465`](https://github.com/hamedniroomand/nuxt-layerscope/commit/30e2465b33dc023dcd932e6d3db9297778006134) - `init` says when it found no data from the Nuxt module and reads symbols from the generated types.

## 0.6.2

### Patch Changes

- [#93](https://github.com/hamedniroomand/nuxt-layerscope/pull/93) [`556c358`](https://github.com/hamedniroomand/nuxt-layerscope/commit/556c3581bb25503cc2c991dc31072b36aa6e1cf2) - layerscope runs git correctly from a git hook in a linked worktree.

- [#93](https://github.com/hamedniroomand/nuxt-layerscope/pull/93) [`dfa80ff`](https://github.com/hamedniroomand/nuxt-layerscope/commit/dfa80ff65abceb35db8856db688758f8c7d636b3) - `init` says when the .nuxt data may be older than nuxt.config.

## 0.6.1

### Patch Changes

- [#90](https://github.com/hamedniroomand/nuxt-layerscope/pull/90) [`a2e3824`](https://github.com/hamedniroomand/nuxt-layerscope/commit/a2e38240b26ca1b5ac716a3911fc66b78e8c2f74) - The `layerscope init` refusal names the keys that are set in the `layerscope` key of `nuxt.config`, and tells you to run `init --prepare`. The suggestion for root code that uses a feature layer, under a preset with `root` as its base, says to move the code to root or remove the use. The root hint is short on each finding when the note gives the full text.

## 0.6.0

### Minor Changes

- [#88](https://github.com/hamedniroomand/nuxt-layerscope/pull/88) [`2f785bc`](https://github.com/hamedniroomand/nuxt-layerscope/commit/2f785bc54599aa0961fd96ce699519ec4f9d005e) - `layerscope init` can suggest a preset with `root` as its base, such as `preset: { name: 'features', base: ['root'] }`, when shared code is in root and the feature layers use only root. The suggestion shows the object form when the base is not the default one.

- [#83](https://github.com/hamedniroomand/nuxt-layerscope/pull/83) [`f33f116`](https://github.com/hamedniroomand/nuxt-layerscope/commit/f33f1168eaebde305cb424d8142bed0885d38f36) - Explain `root` in the `allow` hint. When a layer's `allow` does not list `root`, the suggestion says that `root` is a layer, and `check` and `watch` add one note per layer. The docs describe `root` and `shared/`.

- [#85](https://github.com/hamedniroomand/nuxt-layerscope/pull/85) [`3a749a0`](https://github.com/hamedniroomand/nuxt-layerscope/commit/3a749a0f04f6633a3b77415992f90f3df2aa015a) - Allow `root` as a base layer of a preset, for example `preset: { name: 'features', base: ['root'] }`, so feature layers can use the project's own code without a hand-written `allow`. `root` is always the lowest base layer. Under that preset, `root` may use no other layer unless `layers.root.allow` says so. The allow hint names the preset base when the preset gave the layer its `allow`.

### Patch Changes

- [#87](https://github.com/hamedniroomand/nuxt-layerscope/pull/87) [`d518257`](https://github.com/hamedniroomand/nuxt-layerscope/commit/d5182575306e2e7e366bb3e626572fc373ebb2aa) - Do not report `<component :is>` when the bound value can only be a native HTML or SVG element name, such as a string literal, a ternary of them, or a prop typed as element names or defaulting to one.

## 0.5.0

### Minor Changes

- [#76](https://github.com/hamedniroomand/nuxt-layerscope/pull/76) [`aa2f8d6`](https://github.com/hamedniroomand/nuxt-layerscope/commit/aa2f8d6118f959ce6cc026375339b5dc5d019a60) - New option `typeImports`. With `'ignore'`, a type-only import makes no dependency, so no rule reports it and it is not in the graph. The forms are `import type`, `import { type A }` with `type` on every name, `export type ... from` and `import type x = require(...)`. An import with value names still counts, with the value names only. The default is `'check'`, which keeps the old result.

## 0.4.0

- `require('...')` calls are scanned, also through `createRequire(...)`, and so are `.cjs` and
  `.cts` files. Before, a boundary break through CommonJS code was skipped with no finding. A
  destructured `require` takes the names as a named import does, so `expose` and `only` lists
  apply. `require.resolve(...)` and a `require()` with a value that is not a string literal are
  not counted. `check --staged`, `--changed` and file arguments select `.cjs` and `.cts` files.
- A `layerscope.config.mjs` or `.js` is read again when its content changes in a long-running
  process: `check --watch`, the DevTools tab and `layerscope mcp`. Before, Node kept the first
  copy until the process restarted. A file that the config imports is still read once.
- New preset `features`: a core and a UI kit build up, and every other layer may use them but not
  each other. `layered` and `features` take base layers by name with
  `preset: { name, base: [...] }`, and `features` picks `core`, `base`, `shared` or `common`, then
  `ui` or `design-system`, when you give none. `layerscope init` suggests the strictest preset that
  fits today's dependencies. The MCP `layers` tool now returns `preset` as `{ name, base }` and not
  as a name.
- A guide for moving from eslint-plugin-nuxt-layers: how to convert the layer map, how to run both
  tools, and what differs.
- `layerscope check --staged`, `--changed`, `--since <ref>` and file arguments check only some
  files: the project loads as always, but only the selected files are read and reported. It fits a
  pre-commit hook, with `lint-staged` (file names are read as files) or `--staged`. A file outside
  the project or in no layer is skipped with a note, and nothing selected exits `0` at once. A
  check of some files gives no fix suggestions. `--since` diffs from the merge base with the ref,
  and `--changed` exits `2` with a hint when a shallow or detached checkout has no base branch.
- `pnpm bench` in `packages/layerscope` measures `check` on a generated project of any size, or on
  your own with `--project`: a one-shot run, a run with `nuxi prepare`, and a long-running process
  that reads the cache. The new performance page has the numbers and the method.
- `layerscope mcp` starts a read-only MCP server over stdio, so coding assistants can ask
  focused questions: `check`, `why`, `layers`, `can_use`, `suggest` and `graph`. The analysis stays
  in memory, and each call reads only the files that changed. Paths outside the project are refused.
  Setup for Claude Code, Cursor and VS Code is on the coding assistants page.
- A layer can allow only part of another layer: an entry of `allow` can be `{ layer: 'web', only: ['useCart'] }`.
  `only` takes names and globs on the file path. Any other use of that layer is a `layer-boundary`
  finding that names the entry. The suggestion of a boundary finding proposes a scoped entry when up to
  three names cause the findings. For TypeScript users: `allow` in the config type is now
  `(string | { layer: string; only: string[] })[]`.
- A layer can list its public API in `expose`, with names and globs. The new rule `layer-internal`
  (default `error`) reports a use of any other symbol from another layer, for every kind of
  dependency: auto-imports, components, server utils, shared utils, explicit imports and `#imports`.
  It only looks at layers that set `expose`. The ESLint plugin has the matching rule, and
  `layerscope why` and `unused` show whether a symbol is exposed. Findings of the JSON report have
  the new optional fields `scoped` and `exposed`, and a suggestion can have `only` and `expose`.
- `layerscope check --watch` checks again after each change and shows what is new and what is
  fixed. It analyzes only the changed file, and runs in full when files are added or deleted or
  when a config file or the Nuxt registry changes. It works with every output format and never
  exits with `1`.
- The DevTools tab and `check --watch` no longer run in full when `nuxi dev` writes a generated
  file again with the same content. The environment key now hashes the content.
- `layerscope check --format sarif` writes a SARIF 2.1.0 log for GitHub code scanning. Findings
  that the baseline accepts are included as suppressed results.
- `layerscope check --format gitlab` writes a GitLab Code Quality report for the merge request
  widget. Both formats use paths relative to the git root, so a Nuxt project in a subdirectory
  matches the files in the repository, and one fingerprint for each finding, from the baseline key.

## 0.3.1

- The DevTools tab no longer keeps a `shadowed-component` finding after you delete, rename or move
  the file that causes it. The module now writes the shadowed components of the last scan only,
  so the tab updates without a restart of `nuxi dev`.
- `layerscope check --prepare` no longer prints Node's `WASI is an experimental feature` warning,
  which appears where oxc-parser uses its wasm fallback, such as StackBlitz. Other warnings stay.
- New example project, `examples/shop`: four layers with the layered preset, a baseline, and a
  `violations/` overlay that triggers every rule. Run it locally or on StackBlitz. CI checks its
  findings on every change.

## 0.3.0

- The DevTools tab is a new prebuilt Vue client with six views: Overview, Findings, Trace,
  Unused, Graph and Baseline. Its theme follows Nuxt DevTools, or the OS theme
  when you open `/__layerscope` directly. The server-rendered page is removed;
  `/__layerscope?format=json` still returns the check report.
- Findings filter by severity, rule, layer pair, file and text, with the filters kept in the URL
  hash. Each boundary finding shows its suggestion; an "allow" suggestion comes with a config
  snippet to copy and the findings it resolves. The tab never writes config. Long lists render
  a frame at a time, so a large project opens without a pause.
- Trace lists every use of a component or auto-import, grouped by layer, as `layerscope why`
  does. Unused and Baseline show what `layerscope unused` and the baseline file hold. Each view
  can copy the matching CLI command.
- The Graph view shows which layer depends on which, how much, and where the rules break, with
  dashed edges and `!N` badges for violations. Selecting a layer or an edge shows its files and
  symbols. A Table view shows the same numbers as a matrix and opens first above 15 layers. The
  graph loads as a separate chunk, only when needed.
- The tab updates while you code. An open tab re-runs the analysis 200 ms after a change and says
  what changed ("+2 violations, -1 fixed"). New findings get a `NEW` chip, a "New only" filter
  and the `n` key; `p` pauses. While the tab is closed or hidden, a change does no work. Events
  come from `/__layerscope/events`; when the stream fails, the tab polls `/api/state`.
- Findings can be accepted into `layerscope-baseline.json` from the tab: one row (`i`), a picked
  set (`x` and shift-click) or a whole group, always after an inline confirm. Undo is one click
  for 10 s, and the Baseline view keeps it until the next write and can remove entries. The file
  matches what `check --update-baseline` writes. Writes need a token that only the tab knows,
  come only from the same origin, and are refused when the findings changed in the meantime.
- Keyboard: `1` to `6`, `/`, `r`, `j`, `k`, `o`, `t`, `i`, `x`, `n`, `p`, `e`, `Esc`, and `?`
  for a sheet of every shortcut. The tab passes an axe audit, and every text color has a
  contrast of 4.5:1 or more in both themes.
- Large projects re-run much faster in the tab: suggestions are indexed, the analysis yields to
  the event loop between batches, and the loaded symbols are kept until the registry changes.
- `layerscope: { devtools: { static: true } }` publishes a read-only snapshot of the tab:
  `nuxi build` and `nuxi generate` write `/__layerscope/` to the public output, with paths
  relative to the project. The snapshot has no live updates and no writes, and works on any static
  host.
- New JSON endpoints under `/__layerscope/api`: `symbols`, `trace`, `unused`, `baseline`,
  `graph`, `edge`, `node`, `live/*` and `baseline/*`. `report` adds absolute paths (`absRoot`,
  `absFile`, `absTarget`), `hotFiles` and per-layer `layerStats`.

## 0.2.0

- `layerscope init` writes a starter `layerscope.config.ts` with the smallest `allow` map the
  project passes with, prints every allowed edge and how many references could not be resolved,
  and with `--baseline` accepts what is left. It never replaces a config without `--force`.
- Each `layer-boundary` finding carries a suggestion (`move`, `allow` or `leave`) with its impact,
  in the text, JSON and GitHub outputs. `layerscope fix --dry-run` prints the planned file
  moves and the imports they break.
- New `layer-cycle` rule (off by default) reports cycles between layers with the full chain.
- New `preset` option (`layered`, `stacked`) fills `allow` for layers that do not set it.
- `layerscope drift` says how many violations the code adds and fixes against the baseline on a
  base ref. The GitHub Action writes it, with the baseline size, to the job summary, and posts it
  on the pull request with `comment: true`.
- The JSON report has a JSON Schema, shipped as `nuxt-layerscope/schema/report-1.json`.
- The docs publish `/llms.txt` and `/llms-full.txt` and have a guide for coding assistants.

## 0.1.4

- Packages that Nuxt hoists into the generated tsconfig `paths` (`ofetch`, `consola`, `h3`, `defu`,
  `nitropack`) are no longer reported as unresolved imports.
- The DevTools tab serves JSON endpoints under `/__layerscope/api` (`state`, `report`, `rerun`),
  with an `ETag` revision that only changes when the findings, layers or notes change.
- `eslint --cache` no longer keeps stale results: `configs.recommended` carries a digest of the
  registry and the layer config, so ESLint discards cached results when either changes.
- The ESLint plugin no longer reuses a file's last result after the registry or config changed,
  which showed stale findings in editors until the file's text changed.
- The DevTools tab re-analyzes only files that changed since the last run.
- The DevTools tab reads `layerscope-baseline.json`, so accepted findings are left out and counted
  as "in baseline", like `layerscope check`.

## 0.1.3

- Notes and the `--verbose` line are printed after the report, in every command, so they are the
  last thing on screen. `note:` is highlighted in a terminal.
- `layerscope check` lists files with errors after files with only warnings, so the errors stay
  next to the summary in a long report.
- The text report colors severities, rule names and the summary in a terminal. `NO_COLOR` and
  `FORCE_COLOR` are honoured.

## 0.1.2

- A note appears when `nuxt.config` is newer than the registry, because changes to its
  `layerscope` key only apply after `nuxi prepare`, `dev` or `build`.
- Layer errors caused by the `layerscope` key of `nuxt.config` name it as their source.

## 0.1.1

- Names inside type syntax are no longer reported as unresolved references: labeled tuple members
  (`defineEmits<{ close: [value: boolean] }>()`) and parameters of function types
  (`(...next: T[]) => void`) and `typeof` queries in types.
- `$fetch` is a known global, so it is no longer reported in server code.
- The docs show `defineConfig` imported from `nuxt-layerscope` in every `layerscope.config.ts` sample.

## 0.1.0

Initial release.
