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

| Rule                              | Recommended | Reports                                               |
| --------------------------------- | ----------- | ----------------------------------------------------- |
| `layerscope/layer-boundary`       | `error`     | [`layer-boundary`](../reference/rules) findings       |
| `layerscope/unresolved-reference` | `warn`      | [`unresolved-reference`](../reference/rules) findings |

Severities come from the ESLint config; the `rules` section of `layerscope.config.ts` does not
apply here. Layers, `allow` lists, `ignore` and `globals` do.

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

## Unsaved changes

In ESLint the plugin lints the text in the editor, so a new cross-layer call is reported before the
file is saved. The symbol table itself (which composables and components exist) comes from the
registry and only changes when Nuxt regenerates it.
