# Changelog

## 1.0.0

First release.

- `layers`, `rules`, `ignore` and `globals` can be set under `layerscope` in `nuxt.config`
  instead of `layerscope.config.ts`. The module records them in the registry (new optional
  `config` field), so the CLI, the ESLint plugin and the DevTools tab use them without loading
  Nuxt. Setting them in both places is an error. `AnalyzeResult` now carries the `config` that
  applied.
- Remote layers cloned by c12 are named after their clone folder without its hash, so the name no
  longer changes with the ref. `source` in `layers` names a remote layer by its `extends` string:
  `console: { source: 'github:acme/console' }`.
- Unresolved-reference warnings suggest `globals` for components and identifiers registered at
  runtime.
- `layerscope graph` prints the dependency graph between layers or files as Mermaid, DOT or JSON;
  edges that break the rules are red.
- `layerscope unused` lists components and auto-imports that nothing references, per layer.
- `nuxt-layerscope/eslint`: ESLint plugin (also loads in oxlint through `jsPlugins`) with
  `layer-boundary` and `unresolved-reference` rules, from the module's registry.
- Nuxt DevTools tab with the layers, their allowed dependencies and current findings, while
  `nuxi dev` runs. `layerscope: { devtools: false }` turns it off.
- A note when a layer's `srcDir` does not exist while its `app/` dir does, which happens when an
  extended layer's `srcDir` leaks into a project that does not set its own.
- `resolveComponent(x)` with a runtime value is reported as a dynamic component, like
  `<component :is>`.

- `layerscope check` reports layer boundary crossings through auto-imported composables and
  utils, components (including `Lazy*`), Nitro server utils and explicit imports. Output as text,
  GitHub annotations or versioned JSON.
- `layerscope why <symbol>` lists every use of a symbol, where it resolves to and whether each
  crossing is allowed. Accepts auto-imports, component names (`BaseButton`, `base-button`,
  `LazyBaseButton`) and import specifiers.
- Nuxt module: `modules: ['nuxt-layerscope']` (or `nuxi module add nuxt-layerscope`) records what
  Nuxt resolves (layers, every scanned component including overridden ones, app and server
  auto-imports, scanned component dirs) into `.nuxt/layerscope/registry.json`. The CLI reads it
  when present and falls back to the generated `.d.ts` files otherwise; `--source` picks one and
  `--verbose` prints which was used.
- Baseline: `layerscope check --update-baseline` writes `layerscope-baseline.json`; `check` then
  fails only on findings missing from it and lists fixed entries so the file shrinks. Entries are
  keyed by rule, file, symbol and target layer, not by line.
- Rules: `layer-boundary`, `unresolved-reference` and `shadowed-component` (a component
  overridden by a higher-priority layer; needs the module).
- Findings show the file a symbol resolves to and the layers the source layer may use. JSON
  findings carry `target` and, for `layer-boundary`, `allowed`.
- Layers installed from npm or a remote source (under `node_modules`) own their files, so
  boundaries apply to them. Paths are compared after resolving symlinks (pnpm).
- Layer directories (`srcDir`, `serverDir`, `shared`) come from Nuxt's `getLayerDirectories()`,
  so custom dirs are scanned where Nuxt looks.
- Generated files that point at deleted files or miss new components are reported as stale.
  With the module, every component dir Nuxt scanned is checked, including custom ones.
- `nuxt-layerscope/api` exposes `analyze`, `formatResult` and the baseline helpers.
- GitHub Action (`action.yml`) wrapping `layerscope check --format github`.
