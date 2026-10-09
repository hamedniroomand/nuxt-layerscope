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

A `require('...')` with a string literal is an explicit import, also when it is called through a
name that `createRequire(...)` gave, and `.cjs` and `.cts` files are scanned. So is
`import x = require('...')`, the import form of a `.cts` file. With
`const { a, b } = require('...')` the names are `a` and `b`, as for a named import; a rest element,
a computed key or a plain `require()` takes the whole module. These are not counted:
`require.resolve('...')`, a `require()` with a value that is not a string literal, and a
`createRequire` binding that goes through a function or a reassignment, and `createRequire` imported
under another name (`import { createRequire as cr }`).

To fix a finding, either move the symbol to a layer both may use (often `shared`), or allow the
dependency if it is intended.

### Suggestions

Each `layer-boundary` finding carries one suggestion, in every output format:

- **move** the file to a layer that every layer using it may depend on, when two or more other
  layers use it or allowing it would create a cycle. If several layers qualify, the one with the
  shortest `allow` list wins. Only local layers are targets.
- **allow** the dependency, when that creates no cycle.
- **leave** it, when allowing would create a cycle and no layer can hold the file.

Each suggestion shows what it changes: findings cleared, files and imports affected for a move,
edges added for an allow. [`layerscope fix --dry-run`](./cli#layerscope-fix) prints the moves.

## `layer-cycle`

- Default: `off`

Layers depend on each other in a loop. The finding names the whole chain and sits on the first
reference from the chain's first layer to its second:

```text
layers/a/app/pages/a.vue
  1:1     error  Layers form a cycle: a → b → c → a  layer-cycle
```

It looks at every dependency that exists, not at `allow`, so it also catches cycles between
unrestricted layers. One cycle is reported per lowest layer in it, and fixing it can reveal
another. The rule is opt-in because most existing projects have a cycle somewhere. Turn it on with
`rules: { 'layer-cycle': 'error' }` and accept today's cycles in a [baseline](../guide/baseline).

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
- `<component :is>` bound to a runtime value,
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
