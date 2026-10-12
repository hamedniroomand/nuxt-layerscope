# Explore dependencies

`layerscope check` tells you what is wrong. Three more commands help you understand the codebase
before you change it: `why` traces one symbol, `graph` draws the whole picture, and `unused` finds
what nothing depends on.

## Trace a symbol with `why`

When a finding surprises you, or before you move a composable to another layer, ask where it is
used:

```bash
npx layerscope why useCart
```

```text
useCart → layers/web/app/composables/useCart.ts (web)
  layers/admin/app/components/AdminPanel.vue:2:14   admin → web   ✖ not allowed
  layers/web/app/components/CartSummary.vue:3:14    web → web     ✔ same layer
```

`why` accepts:

- **auto-imports**, such as `useCart`, `formatPrice` or `defineEventHandler`,
- **components**, where `BaseButton`, `base-button` and `LazyBaseButton` name the same one,
- **import specifiers**, exactly as written: `#layers/web/app/composables/useCart`,
  `~/utils/format` or a relative path.

Each use gets a status:

| Status           | Meaning                                                  |
| ---------------- | -------------------------------------------------------- |
| `✔ same layer`   | Used inside the layer that owns it.                      |
| `✔ external`     | Resolves to a package or virtual module, not to a layer. |
| `✔ unrestricted` | The using layer has no `allow` list.                     |
| `✔ allowed`      | The using layer lists the target layer in `allow`.       |
| `✖ not allowed`  | A boundary violation. `layerscope check` reports it.     |

If a name resolves to different files in different contexts, for example a `useDb` server util
and an app composable with the same name, each target is listed on its own.

## Draw the graph

```bash
npx layerscope graph > layers.mmd
```

The default output is a [Mermaid](https://mermaid.js.org) flowchart of your layers. Paste it into
a pull request description or a Markdown doc and GitHub renders it:

```mermaid
flowchart LR
  n0["root"]
  n1["web"]
  n2["shared"]
  n3["auth"]
  n4["admin"]
  n4 --> n3
  n4 -- 3 --> n2
  n4 -- 4 --> n1
  n3 -- 2 --> n2
  n1 -- 3 --> n2
  n0 --> n4
  n0 --> n1
  linkStyle 2 stroke:#d73a49,stroke-width:2px
```

An arrow means "depends on", a number is how many references it carries, and red arrows break
your rules. Packages are left out.

For a file-level view, grouped by layer, and for Graphviz:

```bash
npx layerscope graph --by file --format dot | dot -Tsvg > files.svg
npx layerscope graph --format json > graph.json
```

## Find unused code

```bash
npx layerscope unused
```

```text
web
  CartBadge      layers/web/app/components/CartBadge.vue        component
admin
  useAdminStats  layers/admin/app/composables/useAdminStats.ts  auto-import (app)
  exportCsv      layers/admin/app/utils/exportCsv.ts            auto-import (app)

3 unused symbols in 2 layers

Not counted as uses: test files.
```

`unused` lists components, composables, utils and server utils that are registered by one of your
layers and referenced nowhere. A few rules keep it honest:

- An explicit import of a file counts as using everything the file exports.
- Uses in `nuxt.config.*`, in the Nuxt `modules/` dir, in files of extra auto-import and component
  dirs (`imports.dirs`), and in the project files that counted files import, count too.
- If any file renders a component chosen at runtime (`<component :is>` bound to a value, or
  `resolveComponent(name)`), unused components are marked **possibly used at runtime**, because
  layerscope cannot see which one is picked.

`unused` cannot see all uses. It can miss uses in these places:

- test files (`*.test.*`, `*.spec.*`, `__tests__/`), files outside the layer source dirs that are
  not in an extra auto-import or component dir and that no counted file imports, and files that
  match [`ignore`](../reference/config#ignore);
- files in layers installed under `node_modules`. These layers are dependencies, and their unused
  code is not yours to delete;
- files that layerscope could not read in full: a parse error, a template that layerscope does not
  read (a `lang` other than HTML, a `src` attribute, or an expression that does not parse), an
  `import()` or `require()` with a path that is not a fixed string, or an `import.meta.glob()`;
- uses in a type position, for example `ReturnType<typeof useCart>`, and `import type` uses when
  `typeImports` is `'ignore'`;
- uses in other apps of a workspace. A layer from a workspace package, or a layer that Nuxt
  downloads from git into a cache dir, counts as a project layer. Its symbols can be listed when
  only another app uses them;
- runtime plugins and apps that extend this one.

The last line of the report names test files, `ignore` and package layers, when they apply. The
report lists the files that could not be read before that line. The report does not name the other
places in this list. Layerscope cannot see them. Treat the list as a starting point for review, not
a delete list.

`why` shows only the uses that `check` reads. A use that only `unused` counts, for example in
`nuxt.config.ts`, does not show in `why`.

## Options

All three commands take `--config`, `--prepare`, `--source` and `--verbose`, like `check`.

| Command  | Formats                            | Exit code                                  |
| -------- | ---------------------------------- | ------------------------------------------ |
| `why`    | `text` (default), `json`           | `0` when the symbol is used, `2` otherwise |
| `graph`  | `mermaid` (default), `dot`, `json` | `0`                                        |
| `unused` | `text` (default), `json`           | `0`                                        |

See the [CLI reference](../reference/cli) for every option.
