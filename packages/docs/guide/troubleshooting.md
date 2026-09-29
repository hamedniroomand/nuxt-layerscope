# Troubleshooting

## "… not found. Run "nuxi prepare" first"

layerscope reads files Nuxt generates. Run `npx nuxi prepare`, or pass `--prepare`.

## "… no longer exists" or "… is missing from components.d.ts"

The generated files are older than your code: a component or composable was added, renamed or
deleted since `nuxi prepare` last ran. Run it again, or pass `--prepare`. In CI, make sure
`nuxi prepare` runs after checkout; restoring `.nuxt` from a cache is a common cause.

## An auto-import is reported as unresolved

```text
2:3     warn   "trackEvent" is not a local binding, a known global or an auto-import in the app context; if it is registered at runtime, add it to "globals" in layerscope.config.ts
```

Check the following:

- **Is it registered at runtime?** Globals added by a plugin (`nuxtApp.provide`,
  `app.config.globalProperties`) or `window` properties defined by a script are invisible to
  static analysis. List them in [`globals`](../reference/config#globals).
- **Is it in the right context?** Server files only see Nitro auto-imports, and `shared/` files
  only see imports available in both. A composable from `app/composables` is not available in
  `server/`.
- **Is it auto-imported at all?** Nested directories such as `composables/cart/useCart.ts` are
  not scanned by default. Configure [`imports.dirs`](https://nuxt.com/docs/guide/directory-structure/composables#how-files-are-scanned)
  in Nuxt, run `nuxi prepare`, and layerscope follows.

To silence the rule entirely, set `'unresolved-reference': 'off'`.

## A component is reported as unresolved

`Component <X> is not in components.d.ts` means Nuxt does not know the component: it is
registered globally by a plugin (`app.component('X', ...)`), comes from a library without a Nuxt
module, or lives in a directory that is not a component dir. Add it to `globals` or register the
directory in `components` in `nuxt.config`.

Some Nuxt modules register components at runtime instead of through Nuxt's registry. For example,
`floating-vue/nuxt` calls `vueApp.use(FloatingVue)`, so `VDropdown`, `VTooltip` and `VMenu` never
reach `components.d.ts`:

```ts [layerscope.config.ts]
export default defineConfig({
  globals: ['VDropdown', 'VTooltip', 'VMenu'],
});
```

## `<component :is>` is reported

A dynamic component bound to a runtime value cannot be resolved statically. Resolve the
component explicitly, for example with `resolveComponent('X')` or an imported component, or
accept the warning.

## "Two layers are named …"

Two layers have the same folder name, for example two `extends` entries ending in `/base`. Give
one of them `$meta.name` in its `nuxt.config`, or a `path` in `layerscope.config.ts`. See
[Layer names](./layers#layer-names).

## "Unknown layer … in config"

A key in `layers`, or a name in an `allow` list, does not match any layer. The message lists the
known names. Run with `--format json` to see every layer with its root.

## Findings differ between machines

- Run `nuxi prepare` on both, with the same Nuxt version: layer priority between `layers/*`
  differs between Nuxt 4.0 and later releases.
- Check which source was used with `--verbose`. A machine without the module's registry falls
  back to the generated types.

## The registry is ignored

```text
layerscope: note: .nuxt/layerscope/registry.json has schema version 2, which this layerscope does not read.
```

The module and the CLI come from different versions of `nuxt-layerscope`, for example a global
`npx nuxt-layerscope@latest` against an older project install. Run the project's own
`npx layerscope`, or align the versions.

## Getting help

Open an issue with the output of `npx layerscope check --verbose --format json`, your
`layerscope.config.ts`, and your Nuxt version.
