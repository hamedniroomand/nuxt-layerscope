# Troubleshooting

## "… not found. Run "nuxi prepare" first"

layerscope reads files Nuxt generates. Run `npx nuxi prepare`, or pass `--prepare`.

## "… no longer exists", "… is missing from components.d.ts" or "… is missing from the layerscope registry"

The generated files are older than your code: a component or composable was added, renamed or
deleted since `nuxi prepare` last ran. Run it again, or pass `--prepare`. In CI, make sure
`nuxi prepare` runs after checkout; restoring `.nuxt` from a cache is a common cause. Under
`nuxi dev`, the generated files are written again after a short time, and the error goes away.
If it stays, run `nuxi prepare`.

"… is missing from the layerscope registry" names the new file. It comes only from the registry,
not from the `.d.ts` files. The file can be any new file in an auto-import dir, not only a
composable. For example, the `server/utils/**/*` pattern of Nitro also matches a `README.md` or a
backup file such as `x.ts~`. Run `nuxi prepare` again, and the file is part of the registry.
A new file that Nuxt ignores (`ignore`, `ignorePrefix` or `.nuxtignore`), such as a test file, does
not cause this error in a component dir or in an auto-import dir of the app. Nitro auto-imports
such a file from its dirs, such as `server/utils` and `shared/utils`. There the file causes this
error until the module writes the registry again for another change, or until you run
`nuxi prepare`.

## "Could not read …"

layerscope could not open a component dir or an auto-import dir, so it cannot look for new files
there. The code in the brackets tells the cause. EACCES means that layerscope has no read access to
the dir. Other codes, such as ELOOP or EMFILE, mean that the OS could not open the dir. Fix the
cause. As a workaround, pass `--source types`. It uses the generated `.d.ts` files. It does not
check custom component dirs or auto-import dirs. The message gives this workaround only for an
auto-import dir. For a component dir, fix the cause.

## "Generated types reference …, which layerscope could not read"

layerscope could not reach a file that the generated types refer to, for example because a parent
dir has no access, so it cannot tell if the file still exists. The code in the brackets tells the
cause, as for "Could not read …". Fix the file or its access. A file that layerscope can reach but
cannot read does not stop the check. layerscope lists it as unread.

## "nuxt-layerscope could not read the auto-import dirs of Nuxt"

The module printed this when `nuxi prepare`, `dev` or `build` ran. The text in brackets gives the
reason. The module cannot list the auto-import dirs, so it writes `importDirs: null` in the
registry. Then the stale check does not find new auto-import files, and `layerscope` shows a note
about it. Nothing else changes. Fix the reason (for example, update the `nuxt` package in your
lockfile), and run `nuxi prepare` again.

## An auto-import is reported as unresolved

```text
2:3     warn   "trackEvent" is not a local binding, a known global or an auto-import in the app context; if it is registered at runtime, add it to "globals" in layerscope.config.ts
```

Check the following:

- **Is it registered at runtime?** Globals added by a plugin (`nuxtApp.provide`,
  `app.config.globalProperties`) or `window` properties defined by a script are invisible to
  static analysis. List them in [`globals`](../reference/config#globals).
- **Is it in the right context?** Server files only see Nitro auto-imports, and `shared/` files only
  see imports available in both. A composable from `app/composables` is not available in `server/`.
  Then the message names the context that has it, for example `"useCart" is an auto-import only in
  the app context, not in the server context`, and does not suggest `globals`: move the code, or
  move the symbol to `shared/` (when the symbol is your code).
- **Is it a component?** A component is not an auto-import in code, except in `h()` in a `.vue`,
  `.jsx` or `.tsx` file. Then the message says that the name is a component. In the app context, use
  it in a template or import it from `#components`. Server and shared code cannot use a component.
- **Is it auto-imported at all?** Nested directories such as `composables/cart/useCart.ts` are
  not scanned by default. Configure [`imports.dirs`](https://nuxt.com/docs/guide/directory-structure/composables#how-files-are-scanned)
  in Nuxt, run `nuxi prepare`, and layerscope follows.

To silence the rule entirely, set `'unresolved-reference': 'off'`.

## A component is reported as unresolved

`Nuxt has no component <X>` means that Nuxt does not know the component: it is registered globally
by a plugin (`app.component('X', ...)`), comes from a library without a Nuxt module, or lives in a
directory that is not a component dir. Add it to `globals` or register the directory in `components`
in `nuxt.config`.

Some Nuxt modules register components at runtime instead of through Nuxt's registry. For example,
`floating-vue/nuxt` calls `vueApp.use(FloatingVue)`, so `VDropdown`, `VTooltip` and `VMenu` never
reach the components that Nuxt registers:

```ts [layerscope.config.ts]
import { defineConfig } from 'nuxt-layerscope';

export default defineConfig({
  globals: ['VDropdown', 'VTooltip', 'VMenu'],
});
```

## `<component :is>` is reported

A dynamic component bound to a runtime value cannot be resolved statically. Resolve the
component explicitly, for example with `resolveComponent('X')` or an imported component, or
accept the warning. A value that can only be an HTML or SVG element name is not reported; see
[`unresolved-reference`](../reference/rules#unresolved-reference).

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

If the note says that the registry is from an older nuxt-layerscope, or is damaged, and has no
data that this release needs, run `nuxi prepare` to write it again.

## New findings after an upgrade

After an upgrade, `check` can report new findings for code that it did not read before. For example,
`check` reads an `import()` in a template. An `import()` with a fixed path can give a
`layer-boundary` or `layer-internal` error. An `import()` with a path that is not a fixed string
gives a "Could not read import()" finding of `unresolved-reference`. Fix the code, or accept the
findings with `layerscope check --update-baseline`.

## Getting help

Open an issue with the output of `npx layerscope check --verbose --format json`, your
`layerscope.config.ts`, and your Nuxt version.
