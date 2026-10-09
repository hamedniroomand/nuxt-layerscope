# Config

layerscope reads `layerscope.config.ts` from the project root. `.mts`, `.js` and `.mjs` work too.
Another path can be given with [`--config`](./cli#layerscope-check). Without a config file every
layer is unrestricted.

```ts [layerscope.config.ts]
import { defineConfig } from 'nuxt-layerscope';

export default defineConfig({
  layers: {
    shared: { allow: [] },
    auth: { allow: ['shared'] },
    shop: { allow: ['shared', 'auth'] },
    admin: { allow: ['shared', 'auth'] },
    ui: { path: 'node_modules/@acme/ui-layer', allow: [] },
  },
  rules: {
    'layer-boundary': 'error',
    'unresolved-reference': 'warn',
    'shadowed-component': 'warn',
  },
  ignore: ['**/*.stories.ts'],
  globals: ['$analytics', 'VueDatePicker'],
});
```

`defineConfig` only adds types. The file is loaded with [jiti](https://github.com/unjs/jiti), so
TypeScript works without a build step, and `nuxt-layerscope` resolves even when layerscope runs
through `npx`.

## In `nuxt.config`

The same options can live in `nuxt.config` instead, under the module's `layerscope` key:

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['nuxt-layerscope'],
  layerscope: {
    layers: {
      shared: { allow: [] },
      shop: { allow: ['shared'] },
    },
    rules: { 'shadowed-component': 'error' },
    globals: ['VDropdown'],
  },
});
```

The module records them in the registry on `nuxi prepare`, `dev` and `build`, so the CLI, the ESLint
plugin and the DevTools tab read them without loading Nuxt, and values computed from environment
variables are resolved as Nuxt resolved them. After changing them, run `nuxi prepare` again (or
restart `nuxi dev`); until then layerscope prints a note that `nuxt.config` is newer than the
registry. Setting `layers`, `rules`, `ignore` or `globals` both there and in
`layerscope.config.ts` is an error; `buildDir` only works in the file.

## `layers`

- Type: `Record<string, { allow?: (string | { layer: string; only: string[] })[]; expose?: string[]; path?: string; source?: string }>`

Keys are [layer names](../guide/layers#layer-names). Every key and every name in an `allow` list
must be a layer of the project, otherwise layerscope exits with `2` and lists the known names.

### `allow`

The layers this layer may depend on.

- Dependencies inside a layer are always allowed.
- Dependencies on packages (anything outside every layer) are always allowed.
- A layer without `allow`, or missing from `layers`, is **unrestricted**.
- `allow: []` means the layer may only use itself and packages.

`allow` is not transitive: if `shop` allows `auth` and `auth` allows `shared`, `shop` may still not
use `shared` unless it lists it.

An entry can also be an object that allows only part of a layer:

```ts [layerscope.config.ts]
layers: {
  admin: { allow: ['shared', { layer: 'web', only: ['useCart', 'CartSummary'] }] },
}
```

Here `admin` may use `useCart` and `<CartSummary>` from `web`. Any other use of `web` from `admin`
is a [`layer-boundary`](./rules#layer-boundary) finding that names the entry. `only` takes
[names and globs](#names-and-globs). A scoped entry is a real dependency, so
[`layer-cycle`](./rules#layer-cycle) and the graph count it. Each layer can have one entry in the
list when that entry has `only`; the same layer twice as plain names is fine.

### `expose`

The public API of this layer. Layers that may use it can use only what `expose` lists:

```ts [layerscope.config.ts]
layers: {
  web: { allow: ['shared'], expose: ['useCart', 'CartSummary'] },
  admin: { allow: ['shared', 'web'] },
}
```

Here `admin` may use `useCart` and `<CartSummary>`. A use of `useCartStorage` from `web` is a
[`layer-internal`](./rules#layer-internal) finding. Without `expose`, all of a layer is public, as
before, and uses inside the layer are never findings. `expose: []` makes nothing public.

`expose` and `allow` both apply: a use must be reachable through `allow` of the using layer
(`only` narrows it) and public through `expose` of the used layer. An `only` entry cannot reach a
symbol that the layer keeps internal: the layer that owns the code decides what is public.

### Names and globs

Entries of `expose` and `only` are names or globs.

- A **name** is an identifier. It matches an auto-import or a Nitro server util by name, and a
  component by its PascalCase name, without a `Lazy` prefix: `CartSummary` also covers
  `<LazyCartSummary>` and `<cart-summary>`. For an explicit import it matches each name that the
  statement imports (`import { useCart } from '...'`). For a default or a namespace import it
  matches the file name without its extension, as Nuxt names a composable.
- A **glob** is anything else, such as `app/composables/cart/**`. It matches the path of the file
  in the layer, relative to the layer root, with forward slashes. `*` and `?` stay inside one
  folder, `**` crosses folders, and every other character is literal.

### `path`

The layer's root, relative to the project root. It does two things:

- **Names a Nuxt layer.** The layer at that root gets the key as its name, which helps with layers
  from npm or git and with two layers that share a folder name.
- **Declares layers without Nuxt.** When `@nuxt/kit` cannot be loaded (dependencies not installed)
  and the Nuxt module wrote no registry, the layers are taken from `path` entries. The project root
  is added as `root`. Nuxt's defaults are assumed: `app/` as `srcDir` when it exists, `server/`
  and `shared/`.

### `source`

The `extends` source of a remote layer, exactly as written in `nuxt.config`, such as
`'github:acme/console'`. The layer c12 cloned from it gets the key as its name. The match ignores
the ref, so `github:acme/console#v2` names the same layer. A layer sets either `path` or `source`.

## `preset`

- Type: `'layered' | 'stacked'`

Fills `allow` for every layer that does not set it. `root` is left unrestricted, and a layer's own
`allow` always wins over the preset. A preset does not touch `expose`, so the two work together.

| Preset    | Shape                                                                                     | Fits                                         |
| --------- | ----------------------------------------------------------------------------------------- | -------------------------------------------- |
| `layered` | `shared` uses nothing; every other layer may use only `shared`, never each other          | Independent feature layers on a common base  |
| `stacked` | Each layer may use only the layers below it in Nuxt's priority order, as `extends` stacks | Layers that build on each other, base to app |

```ts [layerscope.config.ts]
export default defineConfig({
  preset: 'layered',
  layers: { admin: { allow: ['auth'] } }, // one exception
});
```

`layered` expects a layer named `shared`; without one, layers may use nothing.

## `rules`

- Type: `Record<string, 'off' | 'warn' | 'error'>`

| Rule                                                   | Default |
| ------------------------------------------------------ | ------- |
| [`layer-boundary`](./rules#layer-boundary)             | `error` |
| [`layer-cycle`](./rules#layer-cycle)                   | `off`   |
| [`layer-internal`](./rules#layer-internal)             | `error` |
| [`unresolved-reference`](./rules#unresolved-reference) | `warn`  |
| [`shadowed-component`](./rules#shadowed-component)     | `warn`  |

`error` findings fail the check (exit `1`), `warn` findings are reported only, `off` disables
the rule. An unknown rule name is a config error.

## `ignore`

- Type: `string[]`

Globs of files not to check, relative to each scanned directory (a layer's `srcDir`,
`serverDir` and `shared/`). These are always ignored: `node_modules`, `.nuxt`, `.output`, `dist`,
`.config`, type declarations, `nuxt.config.*`, `layerscope.config.*`, test files (`*.test.*`,
`*.spec.*`, `__tests__`), and `modules/` and `public/`.

```ts
ignore: ['**/*.stories.ts', 'playground/**'],
```

Ignored files are not scanned, but symbols they define are still resolved.

## `globals`

- Type: `string[]`

Identifiers and component names that exist at runtime without Nuxt knowing about them, so they
are never reported as unresolved: properties from `nuxtApp.provide`, globals set by a script, or
components registered by a plugin.

JavaScript, browser and Node.js globals, Vue's SFC macros (`defineProps`, `defineModel`, …) and
`RouterLink` / `RouterView` are known already.

## `buildDir`

- Type: `string`
- Default: `'.nuxt'`

Nuxt's build directory, relative to the project root. Set it when `nuxt.config` sets `buildDir`.
