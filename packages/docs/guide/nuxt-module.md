# Nuxt module

The package's default export is a Nuxt module. It records what Nuxt resolves into
`.nuxt/layerscope/registry.json`, which the CLI then reads.

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['nuxt-layerscope'],
});
```

## Why use it

layerscope works without the module by reading the types Nuxt generates (`.nuxt/components.d.ts`,
`.nuxt/types/imports.d.ts` and friends). Both give the same boundary findings, but the module is
better in three ways:

|                                                               | With the module                                                              | Without it                                                |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| Source                                                        | Nuxt's own hooks                                                             | generated `.d.ts` files, whose format is not a public API |
| Overridden components                                         | every scanned component, including the ones a higher-priority layer replaces | only the winner                                           |
| [`shadowed-component`](../reference/rules#shadowed-component) | reported                                                                     | not available (layerscope says so)                        |
| Stale check                                                   | every component dir Nuxt scanned, custom dirs included                       | only the default `components/` dirs                       |
| Shared context on Nuxt 3                                      | as Nuxt resolves it                                                          | derived from app and server imports                       |

## When it runs

The registry is written whenever Nuxt generates types:

- `nuxi prepare` (and `layerscope check --prepare`)
- `nuxi dev`, again after each change that adds or removes components or auto-imports
- `nuxi build`

It adds no code to your app and does nothing at runtime.

## What it records

| Nuxt hook or API                                   | Recorded                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `getLayerDirectories()`                            | every layer in priority order, with its directories                                     |
| `components:dirs` and each dir's `extendComponent` | every scanned component, including overridden ones, and the files of each component dir |
| `components:extend`                                | the components Nuxt registered                                                          |
| `imports:context`                                  | the app's auto-imports, with their source                                               |
| Nitro's unimport context (`nitro:init`)            | the server's auto-imports                                                               |

See the [registry file reference](../reference/registry) for the format.

## Options

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['nuxt-layerscope'],
  layerscope: {
    // Set to false to stop writing the registry.
    enabled: true,
    // Set to false to remove the Nuxt DevTools tab; { static: true } also publishes a snapshot.
    devtools: true,
    // Layers, rules, ignore, globals and typeImports, as in layerscope.config.ts.
    layers: { admin: { allow: ['shared'] } },
  },
});
```

`layers`, `rules`, `ignore`, `globals` and `typeImports` work here exactly as in
[`layerscope.config.ts`](../reference/config#in-nuxt-config); use one place or the other.

The module records them in the registry on `nuxi prepare`, `dev` and `build`. After editing
`nuxt.config`, run `nuxi prepare` again; until then the CLI still uses the old values and prints a
note that `nuxt.config` is newer than the registry.

## DevTools tab

While `nuxi dev` runs, the module also adds a Layerscope tab to Nuxt DevTools. See
[DevTools](./devtools). With `devtools: { static: true }`, `nuxi build` and `nuxi generate` also
write a read-only copy of the tab; see [Publish a static snapshot](./devtools#publish-a-static-snapshot).

## Checking which source was used

```bash
npx layerscope check --verbose
```

```text
layerscope: symbols from the registry (.nuxt/layerscope/registry.json)
```

`--source registry` makes the registry required, which is useful in CI once the module is
installed; `--source types` forces the `.d.ts` files. See [`--source`](../reference/cli#source).
