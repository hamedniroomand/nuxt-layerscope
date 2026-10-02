# Changelog

## Unreleased

- The DevTools tab is a prebuilt Vue client with Overview, Findings and Layers views. Its theme
  follows Nuxt DevTools, and it follows the OS theme when you open `/__layerscope` directly.
  Findings filter by severity, rule, layer pair, file and text, with the filters kept in the URL
  hash. Keyboard: `1` to `3`, `/`, `r`, `j`, `k`, `o` and `Esc`.
- `/__layerscope/api/report` adds absolute paths (`absRoot`, `absFile`, `absTarget`), `hotFiles`
  and per-layer `layerStats`.
- The server-rendered DevTools page is removed. `/__layerscope?format=json` still returns the
  check report.

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
