# Layers

layerscope uses the layers Nuxt resolves, in the same order and with the same directories. This
page explains how they are named and which files belong to them.

## Layer names

| Where the layer comes from                                  | Name                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| The project itself                                          | `root`                                                   |
| `layers/<name>/` (auto-registered, Nuxt 3.12+)              | `<name>`                                                 |
| `extends: ['./base']`                                       | the folder name, `base`                                  |
| `extends: ['@acme/ui-layer']` (npm)                         | the folder name, `ui-layer`                              |
| `extends: ['github:acme/theme']` (cloned by `c12`)          | the clone's folder without its hash, `github_acme_theme` |
| any layer with `$meta: { name: 'ui' }` in its config        | `ui`                                                     |
| any layer with `path` or `source` in `layerscope.config.ts` | the key it is configured under                           |

`$meta.name` is the most reliable way to name a layer you publish, because its folder name depends
on how it is installed:

```ts [nuxt.config.ts of the layer]
export default defineNuxtConfig({
  $meta: { name: 'ui' },
});
```

Or name it from the consuming project with `path`, relative to the project root:

```ts [layerscope.config.ts]
import { defineConfig } from 'nuxt-layerscope';

export default defineConfig({
  layers: {
    ui: { path: 'node_modules/@acme/ui-layer', allow: [] },
  },
});
```

A remote layer is easiest to name by the same string you wrote in `extends`:

```ts [layerscope.config.ts]
import { defineConfig } from 'nuxt-layerscope';

export default defineConfig({
  layers: {
    console: { source: 'github:acme/console' },
    admissions: { allow: ['console'] },
  },
});
```

The name holds when the ref changes (`github:acme/console#v2`), because c12's folder name is
matched without its hash.

Two layers with the same name are an error; give one of them a `path` to tell them apart. That
includes a layer folder named `root`: rename the project with `app: { path: '.' }`.

## Which layer owns a file

A file belongs to the layer whose root is the longest prefix of its path. Paths are compared
after resolving symlinks, so pnpm's linked `node_modules` do not matter.

- Files under `node_modules` that are not inside a layer root belong to no layer. They are
  packages, and depending on a package is always allowed.
- Layers installed from npm or cloned from git live under `node_modules` too, but they are layers:
  boundaries apply to them. A dependency of `admin` on a component of `@acme/ui-layer` is checked
  like any other.

## Which files are checked

layerscope scans the directories Nuxt uses for each layer, as reported by Nuxt's
`getLayerDirectories()`:

- the layer's `srcDir` (`app/` in Nuxt 4, the layer root in Nuxt 3 unless it opts into the
  Nuxt 4 layout),
- its `serverDir` (`server/`),
- its `shared/` dir.

Layers under `node_modules` are dependencies: their code is resolved but not checked, since you
cannot fix it in this repository.

Some files are always skipped: `node_modules`, `.nuxt`, `.output`, `dist`, type declarations,
`nuxt.config.*`, test files (`*.test.*`, `*.spec.*`, `__tests__`), and the root's `modules/` and
`public/` dirs. Add more with [`ignore`](../reference/config#ignore).

## Contexts

Nuxt auto-imports different symbols in different places, and layerscope follows it:

| File under        | Auto-imports resolved from                                          |
| ----------------- | ------------------------------------------------------------------- |
| the `serverDir`   | Nitro's auto-imports (`server/utils`, `h3`, Nitro runtime)          |
| the `shared/` dir | the auto-imports available in both app and server code              |
| everywhere else   | the app's auto-imports (`composables`, `utils`, Vue, Nuxt, modules) |

A `server/api` handler that calls `useCart()` from an app composable is therefore reported as
unresolved, because Nitro cannot auto-import it.

## Nuxt 3 projects with the Nuxt 4 layout

Nuxt 3 applies `future.compatibilityVersion: 4` per layer. A layer that uses the `app/` directory
layout needs the flag in its own `nuxt.config.ts`, otherwise Nuxt (and therefore layerscope)
looks for its components in the layer root:

```ts [layers/shop/nuxt.config.ts]
export default defineNuxtConfig({
  future: { compatibilityVersion: 4 },
});
```

## Public API of a layer

By default every symbol of an allowed layer is public. To keep some of them internal, list the
public ones in [`expose`](../reference/config#expose):

```ts [layerscope.config.ts]
export default defineConfig({
  layers: {
    shared: { allow: [] },
    web: { allow: ['shared'], expose: ['useCart', 'CartSummary'] },
    admin: { allow: ['shared', 'web'] },
  },
});
```

`admin` may use `useCart` and `<CartSummary>`. If it uses `useCartStorage` from `web`, that is a
[`layer-internal`](../reference/rules#layer-internal) finding, and the suggestion says what to add
to `expose`. Use [`expose`](../reference/config#expose) when the layer decides, and an
[`only` list](../reference/config#allow) when the using layer records one known exception:

```ts [layerscope.config.ts]
admin: { allow: ['shared', { layer: 'web', only: ['useCart'] }] },
```

Both apply together. `only` never reaches a symbol that the layer does not expose.

## Layer priority

When two layers provide the same component or auto-import, Nuxt uses the one from the
higher-priority layer, and so does layerscope. The project itself has the highest priority, then
`layers/*`, then `extends` entries in order.

::: warning
Nuxt 4.0 and later 4.x releases order the `layers/*` directories differently. If two of them
override each other, which one wins depends on your Nuxt version. The
[`shadowed-component`](../reference/rules#shadowed-component) rule makes such overrides visible.
:::
