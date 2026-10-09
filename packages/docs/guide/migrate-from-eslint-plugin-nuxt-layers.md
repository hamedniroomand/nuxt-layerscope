# Migrate from eslint-plugin-nuxt-layers

[eslint-plugin-nuxt-layers] checks `import` statements against a map of layers. layerscope checks
the same map, and also the auto-imports and components that have no `import` statement. This page
shows how to move the map, how to run both tools for a while, and when to remove the old plugin.

The steps were run on a Nuxt 4.6 project with eslint-plugin-nuxt-layers 0.2.0, ESLint 9.39 and
layerscope 0.3.1. The output below is the real output of that project.

## What each tool checks

The example project has three layers: `shared`, `products` and `cart`. The `cart` layer may use
only `shared`. The `cart` layer breaks this rule in six places:

- `CartSummary.vue` imports `#layers/products/app/utils/title`.
- `CartSummary.vue` calls the auto-import `useProduct()`, with no import line.
- `CartSummary.vue` renders the component `<ProductCard>`, with no import line.
- `useCartCjs.js` loads the same file with `require()` and with `import()`.
- `useCartExport.js` re-exports from `../../../products/app/utils/title`.

eslint-plugin-nuxt-layers reports four of the six:

```text
layers/cart/app/components/CartSummary.vue
  2:30  error  cart cannot import from products (#layers/products/app/utils/title). Allowed imports: [shared]. To allow this import, add "products" to the canImport array for "cart"  nuxt-layers/layer-boundaries

layers/cart/app/composables/useCartCjs.js
  1:24  error  cart cannot import from products (#layers/products/app/utils/title). Allowed imports: [shared]. To allow this import, add "products" to the canImport array for "cart"  nuxt-layers/layer-boundaries
  4:29  error  cart cannot import from products (#layers/products/app/utils/title). Allowed imports: [shared]. To allow this import, add "products" to the canImport array for "cart"  nuxt-layers/layer-boundaries

layers/cart/app/composables/useCartExport.js
  1:30  error  cart cannot import from products (../../../products/app/utils/title). Allowed imports: [shared]. To allow this import, add "products" to the canImport array for "cart"  nuxt-layers/layer-boundaries

✖ 4 problems (4 errors, 0 warnings)
```

layerscope reports five of the six:

```text
layers/cart/app/components/CartSummary.vue
  2:30    error  Import "#layers/products/app/utils/title" crosses from layer "cart" into "products"  layer-boundary
                 #layers/products/app/utils/title → layers/products/app/utils/title.js
                 allowed for "cart": shared
                 suggestion: allow "cart" to use "products" (adds 1 edge, clears 5 findings)
  4:17    error  Auto-import "useProduct" crosses from layer "cart" into "products"  layer-boundary
                 useProduct → layers/products/app/composables/useProduct.js
                 allowed for "cart": shared
                 suggestion: move it to layer "shared", which all 2 layers using it may depend on (2 files use it, 0 imports to update, clears 1 finding)
  10:5    error  Component <ProductCard> crosses from layer "cart" into "products"  layer-boundary
                 ProductCard → layers/products/app/components/ProductCard.vue
                 allowed for "cart": shared
                 suggestion: allow "cart" to use "products" (adds 1 edge, clears 5 findings)

layers/cart/app/composables/useCartCjs.js
  4:29    error  Import "#layers/products/app/utils/title" crosses from layer "cart" into "products"  layer-boundary
                 #layers/products/app/utils/title → layers/products/app/utils/title.js
                 allowed for "cart": shared
                 suggestion: allow "cart" to use "products" (adds 1 edge, clears 5 findings)

layers/cart/app/composables/useCartExport.js
  1:30    error  Import "../../../products/app/utils/title" crosses from layer "cart" into "products"  layer-boundary
                 ../../../products/app/utils/title → layers/products/app/utils/title.js
                 allowed for "cart": shared
                 suggestion: allow "cart" to use "products" (adds 1 edge, clears 5 findings)

✖ 5 problems (5 errors, 0 warnings)
```

Only layerscope reports the auto-import and the component. Only the old plugin reports the
`require()` call at line 1 of `useCartCjs.js`. layerscope reads ES `import`, dynamic `import()` and `export ... from`, and it
does not read `require()`. Nuxt code is ES modules, so this matters only for a file that still
uses CommonJS.

## Move the layer map

Here is the ESLint config of the example project, with the layer map:

```js [eslint.config.js]
import * as nuxtLayers from 'eslint-plugin-nuxt-layers';
import vueParser from 'vue-eslint-parser';

export default [
  { ignores: ['.nuxt/**', '.output/**', 'node_modules/**'] },
  { files: ['**/*.vue'], languageOptions: { parser: vueParser } },
  {
    files: ['**/*.{js,vue}'],
    plugins: { 'nuxt-layers': nuxtLayers },
    rules: {
      'nuxt-layers/layer-boundaries': [
        'error',
        {
          root: 'layers',
          aliases: ['#layers'],
          layers: {
            shared: [],
            products: ['shared'],
            cart: ['shared'],
            app: ['*'],
          },
        },
      ],
    },
  },
];
```

[Install layerscope](./getting-started#install-the-module) and put the same map in
`nuxt.config.ts`:

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['nuxt-layerscope'],
  layerscope: {
    layers: {
      shared: { allow: [] },
      products: { allow: ['shared'] },
      cart: { allow: ['shared'] },
    },
  },
});
```

Each part of the old option has one place in the new config:

| eslint-plugin-nuxt-layers        | layerscope                                                                |
| -------------------------------- | ------------------------------------------------------------------------- |
| `shared: []`                     | `shared: { allow: [] }`                                                   |
| `products: ['shared']`           | `products: { allow: ['shared'] }`                                         |
| `products: { canImport: [...] }` | `products: { allow: [...] }`                                              |
| `app: ['*']`, or any `['*']`     | Leave the layer out of `layers`. A layer without `allow` is unrestricted. |
| the `app` layer                  | `root`, the project itself. Use `root: { allow: [...] }` to restrict it.  |
| `root: 'layers'`                 | Not needed. Nuxt tells layerscope where each layer is.                    |
| `aliases: ['#layers']`           | Not needed. layerscope uses the aliases that Nuxt resolved.               |
| an unknown name in `canImport`   | An error at start, with exit code `2`. See below.                         |

A layer in `layers/<name>` has the name `<name>` in both tools. Each layer folder needs its own
`nuxt.config.ts`, which can be empty (`export default defineNuxtConfig({})`). Without it, Nuxt
prints `Cannot extend config from layers/<name>/` and layerscope stops with exit code `2`:

```text
layerscope: nuxt.config (layerscope): Unknown layer "shared" in config. Known layers: cart, products, root
```

A name in `allow` that is not a layer stops the check in the same way:

```text
layerscope: nuxt.config (layerscope): layers.cart.allow: unknown layer "prodcts"
```

Layers from `extends`, npm and git are covered in [Layers](./layers#layer-names).

Run the check:

```bash
npx layerscope check --prepare
```

`--prepare` runs `nuxi prepare` first, so the module can record what Nuxt resolved. Run it after
you change the config, or layerscope reads the older registry and prints a note.

## Run both tools

Keep the ESLint rule while you move. The two tools do not depend on each other:

```json [package.json]
{
  "scripts": {
    "lint": "eslint .",
    "lint:layers": "layerscope check --prepare"
  }
}
```

The first run of layerscope can show findings that ESLint never showed. These are the auto-imports
and components. Do not fix them all at once. Accept them in a [baseline](./baseline), and fix
them over time:

```bash
npx layerscope check --prepare --update-baseline
```

```text
✔ Wrote 5 findings to layerscope-baseline.json
```

Commit `layerscope-baseline.json`. From now on, `layerscope check` fails only on new findings:

```text
✔ No problems in 8 files across 4 layers, 5 more in the baseline
```

## Remove the old plugin

Remove eslint-plugin-nuxt-layers when all of these are true:

- `layerscope check` runs in CI, so a boundary break fails the build. See [CI](./ci).
- You have a replacement for the editor feedback, or you do not need it.
- No file in your layers uses `require()` or has the extension `.cjs` or `.cts`. See
  [the differences](#differences-to-know).

For editor feedback, use `nuxt-layerscope/eslint`. It reports layerscope findings in ESLint and in
the editor, with the auto-imports and components:

```js [eslint.config.js]
import layerscope from 'nuxt-layerscope/eslint';
import vueParser from 'vue-eslint-parser';

export default [
  { files: ['**/*.vue'], languageOptions: { parser: vueParser } },
  layerscope.configs.recommended,
];
```

On the example project, this config reports the same five findings as `layerscope check`. It reads
the registry that `nuxi prepare` writes. See [Editor feedback](./editor) for the setup.

Then delete the `nuxt-layers/layer-boundaries` rule and remove the package:

```bash
pnpm remove eslint-plugin-nuxt-layers
```

## Differences to know

- **`require()` is not checked, so moving over can drop checks on CommonJS code.** The old plugin
  reports a `require()` of a file in a forbidden layer. layerscope does not: `require` is a known
  Node global, so a `require()` call is skipped and gives no finding, not even an
  `unresolved-reference` warning. Files with the extensions `.cjs` and `.cts` are not scanned at
  all. In the example above, line 1 of `useCartCjs.js` is the `require()` call that only the old
  plugin reports. If you have CommonJS code in your layers, keep the ESLint rule until this is
  fixed. The fix is planned in [issue 68](https://github.com/hamedniroomand/nuxt-layerscope/issues/68).
- **Layers come from Nuxt, not from the path.** The old plugin finds the layer of an import from
  its text: the first folder after an alias such as `#layers/`, or the folder after `/<root>/` in
  a relative path that it resolves against the file. layerscope uses the layers that Nuxt
  resolved, and the file that each reference resolves to.
- **The whole project is one run.** The old plugin checks one file at a time, inside ESLint.
  layerscope reads the Nuxt registry first, so `nuxi prepare` must run before the check.
- **There is more to configure when you want it.** layerscope also has [`expose`](../reference/config#expose),
  scoped `allow` entries, [rules](../reference/rules) with their own severity, and a
  [baseline](./baseline). None of these exist in the old plugin, and you do not need them to
  migrate.

There is no `layerscope init` option that reads an ESLint config. The old option is one object,
and the table above converts it one line at a time. A converter would have to run the user's
JavaScript, and the saving is too small for that.

[eslint-plugin-nuxt-layers]: https://github.com/alexanderop/eslint-plugin-nuxt-layers
