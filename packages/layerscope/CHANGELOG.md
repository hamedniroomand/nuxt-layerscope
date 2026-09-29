# Changelog

## Unreleased

- Packages that Nuxt hoists into the generated tsconfig `paths` (`ofetch`, `consola`, `h3`, `defu`,
  `nitropack`) are no longer reported as unresolved imports.

## 0.1.3

- Notes and the `--verbose` line are printed after the report, in every command, so they are the
  last thing on screen. `note:` is highlighted in a terminal.
- `layerscope check` lists files with errors after files with only warnings, so the errors stay
  next to the summary in a long report.
- The text report colors severities, rule names and the summary in a terminal. `NO_COLOR` and
  `FORCE_COLOR` are honoured.

## 0.1.2

- A note appears when `nuxt.config` is newer than the registry, because changes to its
  `layerscope` key only apply after `nuxi prepare`, `dev` or `build`.
- Layer errors caused by the `layerscope` key of `nuxt.config` name it as their source.

## 0.1.1

- Names inside type syntax are no longer reported as unresolved references: labeled tuple members
  (`defineEmits<{ close: [value: boolean] }>()`) and parameters of function types
  (`(...next: T[]) => void`) and `typeof` queries in types.
- `$fetch` is a known global, so it is no longer reported in server code.
- The docs show `defineConfig` imported from `nuxt-layerscope` in every `layerscope.config.ts` sample.

## 0.1.0

Initial release.
