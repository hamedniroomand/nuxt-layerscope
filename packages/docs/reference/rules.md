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

These kinds of dependency are checked:

| Kind                     | Example                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auto-imported composable | `useCart()` in a script or <code v-pre>{{ formatPrice(total) }}</code> in a template                                                               |
| Component                | `<CartSummary>`, `<cart-summary>`, `<LazyCartSummary>`, `resolveComponent('cart-summary')`, `h(CartSummary)`, `<CartSummary />` in JSX (see below) |
| Nitro server util        | `getCartStore()` in `server/api/*.ts`                                                                                                              |
| Shared util              | `formatMoney()` from another layer's `shared/utils`                                                                                                |
| Explicit import          | `import { useCart } from '#layers/web/app/composables/useCart'`, `~/…`, relative paths, `@acme/ui-layer/app/composables/useAcme`                   |
| Virtual module import    | `import { useCart } from '#imports'`, `import { CartSummary } from '#components'`                                                                  |

`<NuxtIsland name="X">` is a use of the island component `X`. layerscope sees it only with the
registry, because the `.d.ts` files do not list island components.

A `require('...')` with a fixed path is an explicit import. A fixed path is a string literal, or a
template literal with no `${}`. This is also true when you call `require` through a name that
`createRequire(...)` gave. `createRequire` must be the function that `module` or `node:module`
exports. You can import it by name (also `import { createRequire as cr }`). You can use a namespace
or default import (`mod.createRequire(...)`). In a CommonJS file you can use
`module.createRequire(...)`. A function that you wrote and called `createRequire` is not it. `.cjs`
and `.cts` files are scanned. So is `import x = require('...')`, the import form of a `.cts` file.
With `const { a, b } = require('...')` the names are `a` and `b`, as for a named import. A rest
element or a computed key takes the whole module. So does a `require('...')` that is not in a
destructuring, for example `const x = require('...')`.

These are not counted:

- `require.resolve('...')`.
- a `require()` with no argument. It loads no module, so `check` does not report it.
- a `require()` with a path that is not a fixed string. The `unresolved-reference` rule reports it.
- a name that a function returns from `createRequire(...)`, for example
  `const r = wrap(createRequire(url))`.
- `createRequire` taken with `const { createRequire } = require('module')`.
- a `require` that you renamed or shadowed, `module.require('...')`, and a call such as
  `createRequire(url)('...')` that has no name.

A binding is the name that `createRequire` was assigned to, so a later reassignment of that name
does not change what counts.

In a script, `resolveComponent()` with a fixed name (a string literal, or a template literal with no
`${}`) is a use of that component. The name can be in PascalCase or in kebab-case. `<script setup>`
can name a component in a top-level `const` whose value is directly such a call, for example
`const C = resolveComponent('MyButton')`. Then `<component :is="C">` is not reported, because `C` is
a fixed component. A `let`, a call inside another call or an expression (such as `as any`), and a
name that is not fixed are still reported.

In a `.vue`, `.jsx` or `.tsx` file outside the `server/` dir, `h(CartSummary)` is a use of the
component `CartSummary` when Nuxt registers a component with that name, also when an import or a
local binding has that name. Nuxt reads the text of the name and does not look at the scope, and it
changes such an `h()` call to an import of the component. Nuxt does not change `h()` in a `.ts` or
`.js` file or in the `server/` dir, so there `unresolved-reference` reports a name that has no
binding.

In a `.jsx` or `.tsx` file, or a `<script lang="jsx">` or `<script lang="tsx">` block, outside the
`server/` dir, a JSX tag such as `<CartSummary />` or `<cart-summary />` is a use of that component
when it is not an HTML or SVG element, not `Fragment`, not a local binding and not a JavaScript
global such as `Map`. Vue's JSX plugin compiles such a tag to `resolveComponent()`, and Nuxt changes
it to an import. A tag that is a local binding is a use of that binding, as in a script.

A component name can have more than one file: a `.client` file, a `.server` file and a file with no
suffix, in one layer or in different layers. Nuxt uses one file in the browser and one file on the
server, and the file can be different for a tag and for an import from `#components`. layerscope
checks a use of the name against each file that Nuxt keeps. So a use can also get a finding for a
file that Nuxt does not use for it. For example, a higher layer has `Pair.client.vue` and
`Pair.server.vue`, and a lower layer has `Pair.vue`: Nuxt does not use `Pair.vue` for `<Pair />`. If
both files are in a layer that is not allowed, one use gives one finding for each file. The baseline
entry then has a `count` of 2.

A type-only import (`import type { A } from '...'`) counts as an explicit import, unless
[`typeImports`](./config#typeimports) is `'ignore'`. Then it makes no dependency and no rule
reports it.

A use of a layout or of route middleware by its name is not checked:
`definePageMeta({ layout: 'shop', middleware: ['shop-only'] })`, `<NuxtLayout name="shop">` and
`setPageLayout('shop')`. Global middleware (`middleware/*.global.ts`) runs on every route, so each
page uses it with no reference in the code. A use by URL is not checked either, for example
`navigateTo('/shop')` or `$fetch('/api/cart')` to a page or a server route of another layer. In
these cases, a layer can use a layer that it may not use, and no rule reports it.

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
  - The target has no other component and no other auto-import with the same name. A type export is
    a name too. A relative `export * from` is read, and the names of that file count. layerscope
    does not read an `export * from` a package or an alias, or one whose file unimport does not
    find, such as `./y.js` for `y.ts`. Such a file can export any name. This applies to the moved
    file and to the files in the target. Then the move conflicts with each auto-import on the other
    side.
  - Nuxt finds the file in the target (see below).

  If several layers qualify, the one with the shortest `allow` list wins. After all moves are
  planned, layerscope checks them together. A move that would break `check` together with another
  move is dropped. The findings of a dropped move get the suggestion that they get when no layer
  can hold the file. That is **allow**. It is **leave** when the allow would create a cycle, and the
  message then says that the plan dropped the move. It is also **leave** when `root` uses the file
  and `root` is the base layer of a preset.

  When `layer-cycle` is not `off`, layerscope checks all planned moves together. If a layer cycle
  is shown after the moves and the baseline, and it was not shown before, layerscope drops moves
  until no such cycle is shown.

  The file lands in the same source dir of the target: `srcDir`, `serverDir` or `sharedDir`. A file
  that is in none of these dirs gets no move. For a file that is used as an auto-import, layerscope
  assumes the default dirs of Nuxt: `composables/` and `utils/` in `srcDir`, `utils/` in
  `serverDir`, and `utils/` and `types/` in `sharedDir`. Nuxt reads only the script files at the top
  level of the dirs in `srcDir` and `sharedDir`. It does not read sub dirs, so a file at
  `composables/cart/useCart.ts` or `composables/cart/index.ts` gets no move. Nitro reads
  `server/utils` at any depth. layerscope moves a file there only to the top level or to the `index`
  file of a sub dir. A file that is used as a component must be in `components/`. A target that sets
  `imports.dirs` to a list that is not empty, or turns `imports.scan` off, is not a target for a
  script file (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.mts`, `.cjs` or `.cts`). This is also true
  when only explicit imports use the file, and for a `.tsx` or `.jsx` file that is used as a
  component. Such a layer can scan the dir that the file goes to, and the names of the file can then
  conflict with other auto-imports. layerscope reads only whether a layer changes these settings, so
  a layer that turns `imports.scan` off gets the same check. A target that sets `components` is not
  a target for a component file. layerscope does not know what such a layer scans. A file that is
  used as a component also gets no move when the layer that owns it sets `components`.

- **allow** the dependency, when that creates no cycle. When the use needs only some names, the
  entry is scoped: `{ layer: 'web', only: ['useCart'] }`. See [`allow`](./config#allow).
- **expose** a symbol, for a `layer-internal` finding. Add the entry to `expose` of the layer that
  owns the symbol.
- **leave** it. layerscope has no fix, and the message tells what to do. For a cycle, allowing the
  dependency would create the cycle, and no layer can hold the file or the plan dropped its move:
  report it. For a use of a feature layer by `root`, when `root` is the base of a preset and no
  layer can hold the file or the plan dropped its move, the code must change: move the code to
  `root`, or remove the use.

Each suggestion shows what it changes: findings cleared (for a move: the findings that point at
the file and the findings in it), and files and imports affected for a move
(`impact.imports` is the count of imports that `fix` lists), edges added for an allow.
[`layerscope fix --dry-run`](./cli#layerscope-fix) prints the moves only, and `--apply` makes them.
The other suggestions are in the output of `layerscope check`.

`check` and `fix` do not check the imports in test files, `nuxt.config.*`, the Nuxt `modules/` dir,
files outside the layer source dirs, or files that match `ignore`. Update the imports of moved files
in them by hand.

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
- a component tag or a fixed `resolveComponent()` name that Nuxt has not registered,
- an import path that does not exist, or a name `#imports` / `#components` does not export. This
  includes an import of a layer by its package name when the importing file cannot find the layer
  in `node_modules`, when the layer does not have the file, or when its `exports` do not give a
  file for the path,
- `<component :is>` bound to a runtime value. A value that can only be a native HTML or SVG element
  name is not reported: a string literal, a ternary of them, or a prop typed as a union of element
  names, or a `string` prop whose default is an element name. Vue renders such a name as that
  element, unless a global component has the same name. A `string` prop can reach a global component
  by its name, and layerscope cannot follow a global name to a file, so that prop is not reported.
  `unused` still treats such a file as one that can use a component by name.
  A `string` prop with no default, or with a default that is not an element name, is still reported.
- `resolveComponent()` with a name that is not a string literal or a template literal with no `${}`,
  for example a variable or a template literal with `${}`.
- a template that layerscope cannot read: a template expression that it cannot parse (for example
  TypeScript syntax in a component without a TypeScript script), a `lang` other than HTML, or a
  `src` attribute. Uses in that template are not checked.
- an `import()` or a `require()` with a path that is not a fixed string, such as a template literal
  with `${}` or a variable. The module that it loads is not checked. This also covers an `import()`
  in a template. An `import()` with a fixed path in a template is an explicit import, as in a
  script.
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
layerscope: note: The shadowed-* rules need the registry of the Nuxt module, and this run has no registry, so these rules reported nothing. …
```

## `shadowed-layout`

- Default: `warn`
- Needs the [Nuxt module](../guide/nuxt-module)

Two layers have a layout with the same name, and Nuxt uses only one of them. layerscope reports
the one that Nuxt does not use:

```text
layers/base/app/layouts/default.vue
  1:1     warn   Layout "default" of layer "base" is overridden by layer "root"  shadowed-layout
                 default → app/layouts/default.vue
```

An override is often on purpose. Once it is on purpose, accept it with a
[baseline](../guide/baseline) or turn the rule off.

Limits:

- Only files that have the same path (without the extension) in the layouts dir of each layer are
  reported. `admin/default.vue` and `AdminDefault.vue` in two layers (both are named
  `admin-default`) are not reported.
- Two files in the same layer are not reported.
- A layout or a middleware in a file that no layer owns is not reported.
- A file that is added after the last `nuxi prepare` or dev write is not reported until the
  registry is written again.

Without the registry, the rule reports nothing and prints the note of the shadowed-\* rules.

## `shadowed-middleware`

- Default: `warn`
- Needs the [Nuxt module](../guide/nuxt-module)

Two layers have a route middleware with the same name, and Nuxt uses only one of them. layerscope
reports the one that Nuxt does not use:

```text
layers/base/app/middleware/auth.ts
  1:1     warn   Middleware "auth" of layer "base" is overridden by layer "root"  shadowed-middleware
                 auth → app/middleware/auth.ts
```

An override is often on purpose. Once it is on purpose, accept it with a
[baseline](../guide/baseline) or turn the rule off.

Limits:

- Only files that have the same name in the middleware dir of each layer are reported. `Auth.ts`
  and `auth.ts` in two layers (both are named `auth`) are not reported.
- Two files in the same layer are not reported.
- A layout or a middleware in a file that no layer owns is not reported.
- `middleware/<name>/index.ts` is not used by Nuxt and is not reported.
- A file that is added after the last `nuxi prepare` or dev write is not reported until the
  registry is written again.
- Plugins, server middleware and Nitro plugins are not reported, because Nuxt and Nitro use all of
  them.

Without the registry, the rule reports nothing and prints the note of the shadowed-\* rules.
