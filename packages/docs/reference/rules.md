# Rules

Rules are configured in [`rules`](./config#rules) with `off`, `warn` or `error`.

## `layer-boundary`

- Default: `error`

A file depends on a layer its own layer does not [`allow`](./config#allow). When the entry in
`allow` has an [`only` list](./config#allow), a use of any other symbol of that layer is a finding
as well, and the message names the list:

```text
Auto-import "useCartStorage" crosses from layer "admin" into "web" (allowed: only useCart)
```

```text
layers/admin/app/components/AdminPanel.vue
  2:14    error  Auto-import "useCart" crosses from layer "admin" into "web"  layer-boundary
                 useCart → layers/web/app/composables/useCart.ts
                 allowed for "admin": shared, auth
```

Every kind of dependency is checked:

| Kind                     | Example                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Auto-imported composable | `useCart()` in a script or <code v-pre>{{ formatPrice(total) }}</code> in a template   |
| Component                | `<CartSummary>`, `<cart-summary>`, `<LazyCartSummary>`                                 |
| Nitro server util        | `getCartStore()` in `server/api/*.ts`                                                  |
| Shared util              | `formatMoney()` from another layer's `shared/utils`                                    |
| Explicit import          | `import { useCart } from '#layers/web/app/composables/useCart'`, `~/…`, relative paths |
| Virtual module import    | `import { useCart } from '#imports'`, `import { CartSummary } from '#components'`      |

A `require('...')` with a fixed path (a string literal, or a template literal with no `${}`) is an
explicit import, also when it is called through a name that `createRequire(...)` gave.
`createRequire` is the one that `module` or `node:module` exports, imported by name (also
`import { createRequire as cr }`), through a namespace or default import (`mod.createRequire(...)`),
or the `module.createRequire(...)` of a CommonJS file. A function that you wrote and called
`createRequire` is not it. `.cjs` and `.cts` files are scanned. So is `import x = require('...')`,
the import form of a `.cts` file. With `const { a, b } = require('...')` the names are `a` and `b`,
as for a named import; a rest element, a computed key or a plain `require()` takes the whole module.
These are not counted: `require.resolve('...')`, a `require()` with a path that is not a fixed
string (the `unresolved-reference` rule reports it), and a `createRequire` binding that goes through
a function, and `createRequire` taken with `const { createRequire } = require('module')`. A binding
is the name that `createRequire` was assigned to, so a later reassignment of that name does not
change what counts.

A type-only import (`import type { A } from '...'`) counts as an explicit import, unless
[`typeImports`](./config#typeimports) is `'ignore'`. Then it makes no dependency and no rule
reports it.

To fix a finding, either move the symbol to a layer both may use (often `shared`), or allow the
dependency if it is intended.

### Suggestions

Each `layer-boundary` and `layer-internal` finding that the baseline does not accept has one
suggestion. A finding that the baseline accepts has no suggestion: SARIF lists it as a suppressed
result, and JSON lists it in `baseline.suppressed`. A run on selected files (`check <files>`) makes
no suggestions. Every output format shows the suggestion. In `sarif` and `gitlab` it is the second
line of the message, after `suggestion: `. `sarif` also has it in `properties.suggestion`.

The suggestions and their counts are made for the findings that `check` shows only.

- **move** the file to another layer. layerscope offers a move when two or more other layers use
  the file, or when an `allow` entry would create a cycle. layerscope also tries a move when
  `root` is the base layer of a preset and root uses a file of another layer. Then `root` can be
  the target. A layer is a target only when all of these are true:
  - The layer that owns the file is local. It is a dir of the project, not in `node_modules`. A
    file of the root layer, or of a layer in `node_modules`, does not move.
  - The target is local, or it is the root layer.
  - Each layer that uses the file may use the target. This includes the owner layer.
  - The target exposes each symbol that the users use. This applies only when the target sets
    `expose`.
  - Each dependency of the file may be used from the target. It must pass `allow`, and `expose` of
    the layer that holds it.
  - No file is at the new path, and no other planned move uses that path.
  - The target has no other component and no other auto-import with the same name.
  - Nuxt finds the file in the target (see below).

  If several layers qualify, the one with the shortest `allow` list wins. After all moves are
  planned, layerscope checks them together. A move that would break `check` together with another
  move is dropped. The findings of a dropped move get another suggestion.

  When `layer-cycle` is not `off`, layerscope checks all planned moves together. If a layer cycle
  is shown after the moves and the baseline, and it was not shown before, layerscope drops moves
  until no such cycle is shown.

  The file lands in the same source dir of the target: `srcDir`, `serverDir` or `sharedDir`. A
  file that is in none of these dirs gets no move. For a file that is used as an auto-import,
  layerscope assumes the default dirs of Nuxt: `composables/` and `utils/` in `srcDir`, `utils/`
  in `serverDir`, and `utils/` and `types/` in `sharedDir`. Nuxt reads the script files in these
  dirs and the `index` file of each sub dir. It does not read deeper, so a file at
  `composables/cart/useCart.ts` gets no move. A file that is used as a component must be in
  `components/`. A target that sets `imports.dirs`, turns `imports.scan` off or sets `components`
  is not a target for these files, because layerscope does not know what it scans.

- **allow** the dependency, when that creates no cycle. When the use needs only some names, the
  entry is scoped: `{ layer: 'web', only: ['useCart'] }`. See [`allow`](./config#allow).
- **expose** a symbol, for a `layer-internal` finding. Add the entry to `expose` of the layer that
  owns the symbol.
- **leave** it. layerscope has no fix, and the message tells what to do. For a cycle, allowing the
  dependency would create the cycle and no layer can hold the file: report it. For a use of a
  feature layer by `root`, when `root` is the base of a preset and no layer can hold the file, the
  code must change: move the code to `root`, or remove the use.

Each suggestion shows what it changes: findings cleared (for a move: the findings that point at
the file and the findings in it), and files and imports affected for a move
(`impact.imports` is the count of imports that `fix` lists), edges added for an allow.
[`layerscope fix --dry-run`](./cli#layerscope-fix) prints the moves only, and `--apply` makes them.
The other suggestions are in the output of `layerscope check`.

## `layer-cycle`

- Default: `off`

Layers depend on each other in a loop. The finding names the whole chain and sits on the first
reference from the chain's first layer to its second:

```text
layers/a/app/pages/a.vue
  1:1     error  Layers form a cycle: a → b → c → a  layer-cycle
```

It looks at every dependency that exists, not at `allow`, so it also catches cycles between
unrestricted layers. One cycle is reported per lowest layer in it, and fixing it can reveal another.
When two cycles of the same length go through one layer, the one whose layers sort first is shown.
The rule is opt-in because most existing projects have a cycle somewhere. Turn it on with
`rules: { 'layer-cycle': 'error' }` and accept today's cycles in a [baseline](../guide/baseline). A
baseline accepts a cycle by its chain, so it still accepts the cycle when the file of the first
reference changes.

## `layer-internal`

- Default: `error`

A file uses a symbol that its layer does not list in [`expose`](./config#expose). The rule only
looks at layers that set `expose`, so turning it on changes nothing for a layer that does not. Turn
it on as `warn` first with `rules: { 'layer-internal': 'warn' }`, and accept today's uses in a
[baseline](../guide/baseline).

```text
layers/admin/app/pages/orders.vue
  4:9     error  Auto-import "useCartStorage" is internal to layer "web"  layer-internal
                 useCartStorage → layers/web/app/composables/useCartStorage.ts
                 exposed by "web": useCart, CartSummary
                 suggestion: add "useCartStorage" to expose of "web" (clears 1 finding)
```

It checks every kind of dependency that `layer-boundary` checks: auto-imports, components,
Nitro server utils, shared utils, explicit imports, and `#imports` and `#components`. A use that
`allow` does not reach is a `layer-boundary` finding only, and a use inside the layer is never a
finding. [`layerscope why`](./cli#layerscope-why) says whether the layer exposes a symbol, and
[`layerscope unused`](./cli#layerscope-unused) marks unused symbols that it exposes.

## `unresolved-reference`

- Default: `warn`

Something could not be resolved, so layerscope will not call it safe:

- an identifier that is neither a local binding, a known global nor an auto-import in the file's
  context,
- a component tag Nuxt has not registered,
- an import path that does not exist, or a name `#imports` / `#components` does not export,
- `<component :is>` bound to a runtime value. A value that can only be a native HTML or SVG element
  name is not reported: a string literal, a ternary of them, or a prop typed as a union of element
  names, or a `string` prop whose default is an element name. Vue renders such a name as that
  element, unless a global component has the same name. A `string` prop can reach a global component
  by its name, and layerscope cannot follow a global name to a file, so that prop is not reported.
  `unused` still treats such a file as one that can use a component by name.
  A `string` prop with no default, or with a default that is not an element name, is still reported.
- a template that layerscope cannot read: a template expression that it cannot parse (for example
  TypeScript syntax in a component without a TypeScript script), a `lang` other than HTML, or a
  `src` attribute. Uses in that template are not checked.
- an `import()` or a `require()` with a path that is not a fixed string, such as a template literal
  with `${}` or a variable. The module that it loads is not checked.
- an `import.meta.glob()`. The modules that it loads are not checked.
- a file that could not be parsed.

```text
layers/web/app/composables/useCart.ts
  2:3     warn   "trackEvent" is not a local binding, a known global or an auto-import in the app context; if it is registered at runtime, add it to "globals" in layerscope.config.ts  unresolved-reference
```

Runtime globals from plugins belong in [`globals`](./config#globals). See
[Troubleshooting](../guide/troubleshooting#an-auto-import-is-reported-as-unresolved).

## `shadowed-component`

- Default: `warn`
- Needs the [Nuxt module](../guide/nuxt-module)

Two layers register a component with the same name, and Nuxt uses the one from the
higher-priority layer. The overridden component is reported with both paths:

```text
node_modules/@acme/ui-layer/app/components/BaseCard.vue
  1:1     warn   Component <BaseCard> of layer "ui" is overridden by layer "theme"  shadowed-component
                 BaseCard → layers/theme/app/components/BaseCard.vue
```

Overriding a component is a supported way to customize a layer, but an accidental override (two
teams picking the same name) silently changes what every other layer renders. Once an override
is intended, accept it with a [baseline](../guide/baseline) or turn the rule off.

Only components owned by a layer are reported; a project component that replaces a library
component is not. With the `.d.ts` fallback Nuxt lists only the winning component, so the rule
reports nothing and prints a note on stderr:

```text
layerscope: note: shadowed-component needs the full component registry: add "nuxt-layerscope" to "modules" in nuxt.config. …
```
