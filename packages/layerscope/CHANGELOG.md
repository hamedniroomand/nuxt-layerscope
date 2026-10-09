# Changelog

## Unreleased

- New option `typeImports`. With `'ignore'`, a type-only import makes no dependency, so no rule
  reports it and it is not in the graph. The forms are `import type`, `import { type A }` with
  `type` on every name, `export type ... from` and `import type x = require(...)`. An import with
  value names still counts, with the value names only. The default is `'check'`, which keeps the
  old result.

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
