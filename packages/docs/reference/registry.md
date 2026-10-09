# Registry file

The [Nuxt module](../guide/nuxt-module) writes `.nuxt/layerscope/registry.json`. It is
regenerated on every `nuxi prepare`, `dev` and `build` and should not be committed (`.nuxt` is
usually ignored already). The file is documented so other tools can read it; the `Registry`
type is exported from `nuxt-layerscope/api`.

```json
{
  "version": 1,
  "generator": { "name": "nuxt-layerscope", "version": "0.1.0", "nuxt": "4.5.2" },
  "layers": [
    {
      "name": "root",
      "root": "/repo",
      "srcDir": "/repo/app",
      "serverDir": "/repo/server",
      "sharedDir": "/repo/shared",
      "defaultComponents": true
    }
  ],
  "components": [
    {
      "name": "BaseCard",
      "file": "/repo/layers/theme/app/components/BaseCard.vue",
      "mode": "all",
      "island": false,
      "priority": 3
    }
  ],
  "shadowedComponents": [
    {
      "name": "BaseCard",
      "file": "/repo/node_modules/@acme/ui-layer/app/components/BaseCard.vue",
      "mode": "all",
      "island": false,
      "priority": 1,
      "shadowedBy": "/repo/layers/theme/app/components/BaseCard.vue"
    }
  ],
  "componentDirs": [
    {
      "path": "/repo/layers/theme/app/components",
      "pattern": "**/*.{vue,ts}",
      "ignore": [
        "**/*{M,.m,-m}ixin.{js,ts,jsx,tsx}",
        "**/*.{d.ts,d.mts,d.cts,d.vue.ts,d.vue.mts,d.vue.cts}"
      ],
      "files": ["/repo/layers/theme/app/components/BaseCard.vue"]
    }
  ],
  "imports": {
    "app": [
      { "name": "useCart", "from": "/repo/layers/web/app/composables/useCart.ts" },
      { "name": "useMouse", "from": "@vueuse/core" }
    ],
    "server": [{ "name": "defineEventHandler", "from": "/repo/node_modules/h3/dist/index.mjs" }],
    "shared": [{ "name": "useRuntimeConfig", "from": "nuxt" }]
  }
}
```

| Field                | Description                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `version`            | Schema version. A CLI that does not know it falls back to the `.d.ts` files with a note.                              |
| `generator`          | The `nuxt-layerscope` and Nuxt versions that wrote the file.                                                          |
| `layers`             | Nuxt's layers, highest priority first, with real paths.                                                               |
| `components`         | Components Nuxt registered, without the `Lazy` prefix. `file` is absolute, or a module specifier.                     |
| `shadowedComponents` | Components that lost to a higher-priority one of the same name and a compatible mode (`all`, `client`, `server`).     |
| `componentDirs`      | Every dir Nuxt scanned for components, with the glob it used and the files it matched.                                |
| `imports`            | Auto-imports per context: `name` as used in code, `from` as an absolute path once aliases are resolved, or a package. |
| `config`             | Optional. The `layers`, `rules`, `ignore`, `globals` and `typeImports` set under `layerscope` in `nuxt.config`.       |

Paths are absolute to the machine that wrote the file, which is why it lives in the build dir.
