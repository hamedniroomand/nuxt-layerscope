# nuxt-layerscope

Layer boundary checks for Nuxt 3 and 4 apps that also see auto-imports.

<a href="https://layerscope.kitdev.space/guide/devtools"><img src="https://layerscope.kitdev.space/devtools/hero-dark.webp" width="1600" height="611" alt="The Layerscope tab in Nuxt DevTools: the layer graph of five layers with three violations, the ui to shop edge selected, with useCart in the side panel"></a>

<sub>The Layerscope tab in Nuxt DevTools shows every finding, the layer graph and where each symbol is used. It updates when you save a file.</sub>

Boundary tools usually read `import` statements only, so a component in `admin` that calls an
auto-imported composable from `web` goes unnoticed. layerscope reads the registry Nuxt resolves
(components, app and server auto-imports, layers), resolves every auto-imported identifier,
component tag and explicit import to its source file and layer, and checks the result against
your rules.

```text
layers/admin/app/components/AdminPanel.vue
  2:14    error  Auto-import "useCart" crosses from layer "admin" into "web"  layer-boundary
                 useCart → layers/web/app/composables/useCart.ts
                 allowed for "admin": shared, auth
                 suggestion: allow "admin" to use "web" (adds 1 edge, clears 4 findings)
```

## Usage

```bash
npx nuxi module add nuxt-layerscope --dev   # installs it and adds it to `modules`
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-layerscope'],
});
```

```bash
npx nuxi prepare
npx layerscope check                 # or: npx layerscope check --prepare
```

The module records what Nuxt resolves during `nuxi prepare`, `dev` and `build` into
`.nuxt/layerscope/registry.json`. Without it, layerscope falls back to the generated `.d.ts`
files, which gives the same boundary findings but cannot see overridden components (see
[`shadowed-component`](#rules)). `npx nuxt-layerscope check` works without installing anything.
Set `layerscope: { enabled: false }` in `nuxt.config` to turn the module off.

| Option              | Description                                                              |
| ------------------- | ------------------------------------------------------------------------ |
| `[root]`            | Nuxt project root (default: current dir)                                 |
| `--format <format>` | `text` (default), `github` or `json`                                     |
| `--config <file>`   | Config path (default: `layerscope.config.ts`)                            |
| `--prepare`         | Run `nuxi prepare` first                                                 |
| `--baseline <file>` | Accepted findings, relative to the root (`layerscope-baseline.json`)     |
| `--update-baseline` | Write every current finding to the baseline file and exit `0`            |
| `--source <source>` | `auto` (default: registry when present), `registry` or `types` (`.d.ts`) |
| `--verbose`         | Print where symbols were read from (to stderr)                           |

Exit codes: `0` clean, `1` rule errors, `2` config or input error. Notes, such as a rule that
could not run, go to stderr so stdout stays machine-readable.

`--format github` prints workflow commands, so findings show up inline on the pull request diff.
JSON findings carry `target` (the file the symbol resolves to) and, for `layer-boundary`,
`allowed` and a `suggestion`. The report has a [JSON Schema](https://layerscope.kitdev.space/schema/report-1.json).

### `layerscope init [root]`

Writes `layerscope.config.ts` with every layer and the smallest `allow` map the project passes
with, and prints each allowed edge plus how many references could not be resolved. `--baseline`
also accepts the remaining findings, `--dry-run` writes nothing and `--force` replaces an existing
config. Delete the edges you consider mistakes, then run `check`.

### `layerscope fix --dry-run [root]`

Prints the file moves that the suggestions on boundary findings ask for, and the relative imports
each move breaks. Nothing is applied.

### `layerscope drift [root]`

Prints how many violations the code adds and fixes against the baseline committed on `--base`
(default `origin/main`), and the baseline size before and after. `--format text|markdown|json`.

### Baseline

Turn the check on in a codebase that already has violations, then fix them over time:

```bash
npx layerscope check --update-baseline   # writes layerscope-baseline.json; commit it
npx layerscope check                     # fails only on findings missing from the baseline
```

Entries are keyed by rule, file, symbol and target layer, not by line, so unrelated edits and
moving a violation within its file keep the entry. Entries that no longer occur are listed as
fixed (and as `::notice` annotations with `--format github`); run `--update-baseline` again to
drop them, so the file only shrinks.

### GitHub Action

```yaml
# .github/workflows/layerscope.yml
on: pull_request
jobs:
  layerscope:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24
      - run: npm ci
      - run: npx nuxi prepare
      - uses: hamedniroomand/nuxt-layerscope@main
```

It runs `layerscope check --format github`, so findings show up inline on the pull request, then
writes the drift report to the job summary. Inputs:
`root` (default `.`), `config`, `prepare` (`true` runs `nuxi prepare` instead of the separate
step), `baseline` (default `layerscope-baseline.json`), `comment` (`true` posts the drift report on
the pull request) and `version` (used through `npx` when the
project does not install `nuxt-layerscope`).

### `layerscope why <symbol> [root]`

Lists every file that uses a symbol, where the symbol resolves to and the layer path each use
crosses. It accepts auto-imports, component names (`BaseButton`, `base-button` and
`LazyBaseButton` are the same component) and import specifiers.

```text
$ npx layerscope why useCart
useCart → layers/web/app/composables/useCart.ts (web)
  layers/admin/app/components/AdminPanel.vue:2:14   admin → web   ✖ not allowed
  layers/web/app/components/CartSummary.vue:3:14    web → web     ✔ same layer
```

Takes `--format text|json`, `--config`, `--prepare`, `--source` and `--verbose`. Exit codes: `0` when the symbol is used,
`2` when no use is found.

### `layerscope graph [root]`

Prints the dependency graph between layers (`--by layer`, the default) or between files
(`--by file`, grouped by layer). Edges that break the layer rules are drawn in red and labelled
with how many references they carry. Packages are left out.

```bash
npx layerscope graph > layers.mmd                 # Mermaid, for docs and PR descriptions
npx layerscope graph --by file --format dot | dot -Tsvg > files.svg
```

`--format mermaid` (default), `dot` or `json`. Always exits `0`.

### `layerscope unused [root]`

Lists components and auto-imports (composables, utils, server utils) that nothing references,
per layer. Explicit imports of a file count as using everything it exports. When the project
renders components chosen at runtime (`<component :is>` bound to a value, `resolveComponent(x)`),
unused components are marked "possibly used at runtime". Layers installed as packages are not
checked. `--format text` (default) or `json`. Always exits `0`.

### Editor feedback: ESLint and oxlint

`nuxt-layerscope/eslint` reports the same findings as `check` while you type. It reads the
registry the module writes, so the module is required, and it never boots Nuxt.

```js
// eslint.config.js
import layerscope from 'nuxt-layerscope/eslint';

export default [
  // ...your parsers (vue-eslint-parser for .vue files)
  layerscope.configs.recommended,
];
```

The rules are `layerscope/layer-boundary` and `layerscope/unresolved-reference`. Each takes an
optional `{ root }` (the Nuxt project, relative to the working directory); by default the project
is the nearest directory above the file with `.nuxt/layerscope/registry.json`. Set `root` for layers
that live outside the app (for example a layer package in a monorepo).

oxlint loads the same plugin through `jsPlugins`:

```json
{
  "jsPlugins": [{ "name": "layerscope", "specifier": "nuxt-layerscope/eslint" }],
  "rules": { "layerscope/layer-boundary": "error", "layerscope/unresolved-reference": "warn" }
}
```

oxlint passes only the `<script>` of `.vue` files to plugins, so findings in a template are shown
at the start of the script with their template line in the message.

### Nuxt DevTools

While `nuxi dev` runs, the module adds a **Layerscope** tab to Nuxt DevTools with the layers,
what each may depend on and the current findings. File links open in your editor. The report is
also served as JSON at `/__layerscope?format=json`. Turn it off with `layerscope: { devtools: false }`.
With `layerscope: { devtools: { static: true } }`, `nuxi build` and `nuxi generate` also write a
read-only copy of the tab to `/__layerscope/`, for any static host.

## Config

```ts
// layerscope.config.ts
import { defineConfig } from 'nuxt-layerscope';

export default defineConfig({
  preset: 'layered', // optional: fills `allow` for layers that do not set it
  layers: {
    shared: { allow: [] },
    auth: { allow: ['shared'] },
    web: { allow: ['shared', 'auth'] },
    admin: { allow: ['shared', 'auth'] },
  },
  rules: {
    'layer-boundary': 'error',
    'layer-cycle': 'error', // off by default
    'unresolved-reference': 'warn',
    'shadowed-component': 'warn',
  },
});
```

Or put the same options under `layerscope` in `nuxt.config`, next to `enabled` and `devtools`. The
module records them on `nuxi prepare`, `dev` and `build`; use one place or the other, not both.

- Layer names come from Nuxt: the folder name for `layers/<name>` and for `extends` entries, or
  `$meta.name`. The project itself is `root`. Set `path` on an entry to name a layer explicitly,
  or `source` (the `extends` string, such as `github:acme/console`) to name a remote layer.
- A layer missing from `layers` is unrestricted. Edges within a layer are always allowed.
- `ignore` adds globs to skip, and `globals` lists identifiers or components registered at runtime
  (for example by a plugin) so they are not reported as unresolved.

## Rules

- `layer-boundary`: a file depends on a layer its own layer does not `allow`. This covers
  auto-imported composables and utils, components (including `Lazy*`), Nitro server utils and
  explicit imports (`#layers/...`, `~/...` and relative paths).
- `layer-cycle` (off by default): layers depend on each other in a loop. The finding names the
  whole chain. Turn it on once a baseline holds the cycles you have today.
- `unresolved-reference`: something could not be resolved, so layerscope will not call it safe.
  Examples are an identifier that is neither a local binding, a known global nor an auto-import;
  a component missing from `components.d.ts`; an import path that does not exist; or
  `<component :is>` bound to a runtime value.
- `shadowed-component` (warning): two layers register a component with the same name and Nuxt
  uses the higher-priority one. The overridden component is reported with both paths, so
  accidental overrides are visible. Needs the module; with the `.d.ts` fallback the rule reports
  nothing and says so on stderr.

## How it works

1. Layers come from the project's own `@nuxt/kit`, which every Nuxt install already has:
   `loadNuxtConfig` for the list and names, `getLayerDirectories` for each layer's `srcDir`,
   `serverDir` and `shared` dir. Without kit, layers can be declared with `path` in the config.
2. Each file belongs to the layer with the longest matching root, compared as real paths so
   pnpm symlinks do not matter. Layers installed from npm or a remote source live under
   `node_modules` and still own their files, so boundaries apply to them; their own code is
   resolved but not checked. Anything outside every layer is external. Files under a layer's
   server dir use the Nitro symbol table, and files under its shared dir use the shared one.
3. Scripts are parsed with `oxc-parser` and scope-tracked, so a local `useCart` shadows the
   auto-imported one. Templates are compiled with `@vue/compiler-sfc`, and the render function's
   `resolveComponent("X")` calls and `_ctx.x` reads show which components and identifiers Nuxt
   would auto-import.
4. With the module, symbols come from `.nuxt/layerscope/registry.json`, recorded from Nuxt's own
   hooks: `components:dirs` and `components:extend` (every scanned component, including
   overridden ones), `imports:context` (app auto-imports), Nitro's unimport context (server
   auto-imports) and `getLayerDirectories()` (layers in priority order). The file has a versioned
   schema; a registry from an incompatible release is ignored with a note.
5. Without the module, components come from `.nuxt/components.d.ts` (or
   `.nuxt/types/components.d.ts`) and auto-imports from `.nuxt/types/*imports.d.ts`. On Nuxt 3,
   which writes no `shared-imports.d.ts`, the shared context gets the imports app and server
   have in common, as Nuxt 4 does.
6. Generated files that point at deleted files, or that miss a component, are treated as stale
   (exit `2`). With the registry every dir Nuxt scanned is compared, including custom component
   dirs; without it only the default `components/` dirs are.

The JSON report (`--format json`) is versioned and deterministic: the same input produces the same
bytes.

## Package entry points

| Import                                 | Contents                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `nuxt-layerscope`                      | The Nuxt module (default export), `defineConfig` and the types. Light enough for Nuxt startup. |
| `nuxt-layerscope/api`                  | `analyze`, `formatResult`, `createBaseline` and the report and registry constants.             |
| `nuxt-layerscope/eslint`               | ESLint and oxlint plugin with `layer-boundary` and `unresolved-reference` rules.               |
| `nuxt-layerscope/schema/report-1.json` | JSON Schema of the `--format json` report.                                                     |
| `layerscope` (bin)                     | The CLI.                                                                                       |

```ts
import { analyze, formatResult } from 'nuxt-layerscope/api';

const result = await analyze({ rootDir: 'apps/shop' });
process.stdout.write(formatResult(result, 'text'));
```

## Compared with other tools

Other tools cover parts of this. layerscope is narrower: it resolves symbols exactly the way Nuxt
does, understands Nuxt layer semantics, and is built to fail a CI job.

|                                               | layerscope                             | [eslint-plugin-nuxt-layers] | [nuxt-fsd]      | [Archora]                     | [Nuxt DevTools]     |
| --------------------------------------------- | -------------------------------------- | --------------------------- | --------------- | ----------------------------- | ------------------- |
| Boundary rules on explicit imports            | ✓                                      | ✓                           | ✓ (FSD layers)  | ✓                             | –                   |
| Boundary rules on auto-imports and components | ✓                                      | –                           | –               | ✓                             | –                   |
| Resolves symbols from                         | Nuxt's generated types and `@nuxt/kit` | import paths                | its own aliases | its own analyzer              | the running app     |
| Knows Nuxt layers (`extends`, `layers/`, npm) | ✓                                      | folder layout               | –               | not Nuxt-specific             | shows them          |
| CI gate                                       | exit codes, PR annotations             | via ESLint                  | –               | exit codes, thresholds        | –                   |
| Scope                                         | Nuxt layer boundaries                  | import boundaries           | FSD structure   | general architecture analyzer | dev-time inspection |

- **eslint-plugin-nuxt-layers** checks `import` statements against a layer map. It works inside
  ESLint and the editor, but auto-imports have no import statement to check.
- **nuxt-fsd** sets up Feature-Sliced Design in Nuxt and blocks cross-imports, but its own README
  notes that auto-imports do not respect those rules.
- **Archora** (`@archora/cli`) is a general frontend architecture analyzer that also resolves Nuxt
  auto-imported composables, alongside cycles, churn and bundle analysis. Pick it for a broad
  architecture report; pick layerscope for exact Nuxt layer boundaries as a CI gate.
- **Nuxt DevTools** shows components and auto-imports of a running app, but does not enforce rules.

[eslint-plugin-nuxt-layers]: https://github.com/alexanderop/eslint-plugin-nuxt-layers
[nuxt-fsd]: https://github.com/aabounegm/nuxt-fsd
[Archora]: https://github.com/archora-dev/archora
[Nuxt DevTools]: https://devtools.nuxt.com
