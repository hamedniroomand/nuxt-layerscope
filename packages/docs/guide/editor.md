# Editor feedback

`nuxt-layerscope/eslint` reports layer boundary findings while you type, from the same analysis as
`layerscope check`. It works in ESLint and in oxlint.

It reads `.nuxt/layerscope/registry.json`, so the [Nuxt module](./nuxt-module) must be installed.
The linter never starts Nuxt; after adding components or auto-imports, keep `nuxi dev` running or
run `nuxi prepare` so the registry is current. The plugin reloads it when it changes.

## ESLint

```js [eslint.config.js]
import layerscope from 'nuxt-layerscope/eslint';
import vueParser from 'vue-eslint-parser';

export default [
  { files: ['**/*.vue'], languageOptions: { parser: vueParser } },
  layerscope.configs.recommended,
];
```

With `@nuxt/eslint`, add `layerscope.configs.recommended` to the configs you pass to
`withNuxt()`.

| Rule                              | Recommended | Reports                                                        |
| --------------------------------- | ----------- | -------------------------------------------------------------- |
| `layerscope/layer-boundary`       | `error`     | [`layer-boundary`](../reference/rules) findings                |
| `layerscope/layer-internal`       | `error`     | [`layer-internal`](../reference/rules#layer-internal) findings |
| `layerscope/unresolved-reference` | `warn`      | [`unresolved-reference`](../reference/rules) findings          |

Severities come from the ESLint config; the `rules` section of `layerscope.config.ts` does not
apply here. Layers, `allow` lists, `ignore`, `globals` and `typeImports` do.

### Caching

`eslint --cache` keys a cached result on the file and the ESLint config, but layerscope's findings
also depend on the registry and the layer config. `layerscope.configs.recommended` therefore carries
a digest of both, computed when `eslint.config.js` loads, so changing either makes ESLint discard
its cached results.

- Run `nuxi prepare` before linting, or keep `nuxi dev` running, so the registry is current:
  `"lint": "nuxi prepare && eslint . --cache"`.
- The digest looks for the project from the directory ESLint runs in. With a `root` option, or with
  the rules set up by hand instead of `configs.recommended`, delete the cache after changing layers
  or config.
- A cached file is not re-linted when only the files it imports change on disk, for example one is
  moved and the registry stays the same. Lint without `--cache` in CI.

### Finding the project

By default the project is the nearest directory above the linted file that contains
`.nuxt/layerscope/registry.json`. Pass `root` when that is not right, for example for a layer
package that lives outside the app in a monorepo, or a custom `buildDir`:

```js
{
  rules: {
    'layerscope/layer-boundary': ['error', { root: 'apps/shop' }],
  },
}
```

`root` is relative to the directory ESLint runs in.

## oxlint

oxlint loads the same plugin as a JS plugin:

```json [.oxlintrc.json]
{
  "jsPlugins": [{ "name": "layerscope", "specifier": "nuxt-layerscope/eslint" }],
  "rules": {
    "layerscope/layer-boundary": "error",
    "layerscope/unresolved-reference": "warn"
  }
}
```

oxlint hands plugins only the `<script>` of a `.vue` file. layerscope reads the saved file to see
the template too; findings in the template are reported at the start of the script, with the
template line in the message.

## Files outside the layer root

A layer can keep its `srcDir`, `serverDir` or shared dir outside its root, for example
`serverDir: '../api'` in a monorepo. The plugin checks the files in these dirs. It looks for
`.nuxt/layerscope/registry.json` above the linted file, so for these files it finds none, and says
so. Set the `root` option to the Nuxt project dir. The linter resolves it from the directory that
you run the linter in, not from the config file.

ESLint 10 looks for the config file above the linted file, and it does not lint a file outside the
directory of its config file. So `eslint ../api` in the Nuxt project dir fails when `api` has no
config file. When `api` has a config file, that run uses it, and `root` is resolved from the dir
where you run, so it can point to the wrong dir. Run the linter in `api`. oxlint refuses a path with
`..`.

The examples are for a run in `api`, so `root` is relative to `api`.

```js [api/eslint.config.js]
import layerscope from 'nuxt-layerscope/eslint';
import tseslint from 'typescript-eslint';

const root = '../app';

export default [
  { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
  layerscope.configs.recommended,
  {
    rules: {
      'layerscope/layer-boundary': ['error', { root }],
      'layerscope/layer-internal': ['error', { root }],
      'layerscope/unresolved-reference': ['warn', { root }],
    },
  },
];
```

oxlint has no `configs.recommended`, so list the same rules:

```json [api/.oxlintrc.json]
{
  "jsPlugins": [{ "name": "layerscope", "specifier": "nuxt-layerscope/eslint" }],
  "rules": {
    "layerscope/layer-boundary": ["error", { "root": "../app" }],
    "layerscope/layer-internal": ["error", { "root": "../app" }],
    "layerscope/unresolved-reference": ["warn", { "root": "../app" }]
  }
}
```

Then run `eslint .` or `oxlint .` in `api`. Delete the ESLint cache after you change layers or
config, as with any `root` option.

## Watch mode

`layerscope check --watch` runs a full check, then checks again each time you save a file. It is
the lightest way to get feedback in a terminal while you write code:

```bash
layerscope check --watch
```

```text
12:03:41  214 files  +1 new  -0 fixed  18 ms  watching, Ctrl+C to exit
```

- A change to one file analyzes that file again. Adding or deleting a file analyzes all files
  again, because it can change what an import resolves to. A change to a config file or to the
  generated files in `.nuxt` also gives a full run.
- It does not run `nuxi prepare` for you. After you add or delete a component or an auto-import
  file, run `nuxi prepare`. If a new file is missing from the generated files, or the generated
  files name a file that is gone, each run stops with an error that names that file. The watch
  reads the registry again when it changes. The option `--prepare` runs `nuxi prepare` once, at
  the start. When `nuxi dev` runs, the error can show for a short time after you add a component
  or a composable. Nuxt then writes the registry again, and the next run is clean. Nuxt does not
  write the registry again after you add a server util, or a file that Nuxt ignores, such as a
  test file. Then run `nuxi prepare`.
- A change to `layerscope.config.*` applies on the next run, in every config format. A local file
  that the config imports is not read again: change the config file as well (for example, add a
  comment), or start the watch again.
- Layers in `node_modules` are not watched. A `srcDir`, `serverDir` or shared dir outside the
  layer root is watched. When a run finds such a dir, the watch starts to watch it and runs the
  check again. If the file watcher reports an error, for example for a dir that it cannot read,
  layerscope prints a warning and the watch goes on.
- It never exits with `1`: findings are shown, not counted. Ctrl+C exits with `0`. A run that
  fails, such as a config error, is printed and the watch goes on.
- On a terminal each run clears the screen, and a save that changes nothing only updates the
  status line. Without a terminal, a separator line starts each run. With `--format json`,
  `sarif` or `gitlab`, each run writes one complete document to stdout and the status line goes
  to stderr.

## Unsaved changes

In ESLint the plugin lints the text in the editor, so a new cross-layer call is reported before the
file is saved. The symbol table itself (which composables and components exist) comes from the
registry and only changes when Nuxt regenerates it.
