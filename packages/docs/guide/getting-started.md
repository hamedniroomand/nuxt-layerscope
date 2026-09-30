# Getting started

Add layerscope to a Nuxt project, declare which layers may use which, and run the check. This
takes about five minutes.

You need Node.js 22.18 or later and Nuxt 3.12 or later, or Nuxt 4.

<Steps>

### Install the module

```bash
npx nuxi module add nuxt-layerscope --dev
```

This installs the package and adds it to `modules` in `nuxt.config.ts`. With another package
manager, install `nuxt-layerscope` as a dev dependency and add the module yourself:

::: code-group

```bash [pnpm]
pnpm add -D nuxt-layerscope
```

```bash [npm]
npm install -D nuxt-layerscope
```

```bash [yarn]
yarn add -D nuxt-layerscope
```

```bash [bun]
bun add -D nuxt-layerscope
```

:::

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['nuxt-layerscope'],
});
```

### Generate a starting config

```bash
npx layerscope init --baseline
```

`init` lists your layers and writes a `layerscope.config.ts` that allows exactly the dependencies
that exist today. Each allowed edge is printed, with its reference count and an example. It also
reports how many references could not be resolved and where they cluster, which tells you how much
layerscope can see. With `--baseline`, the remaining findings are accepted so the first CI run is
green. It never overwrites a config without `--force`.

The generated map records what is, not what is intended. Delete the lines for dependencies you
consider mistakes and run `layerscope check`: each deleted line becomes a finding you can fix or
[baseline](./baseline). To write the config by hand instead, continue below.

### Declare your boundaries

List each layer and the layers it may depend on. Keep them in `nuxt.config.ts`, or in a
`layerscope.config.ts` next to it if you prefer a separate file:

::: code-group

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['nuxt-layerscope'],
  layerscope: {
    layers: {
      shared: { allow: [] },
      auth: { allow: ['shared'] },
      shop: { allow: ['shared', 'auth'] },
      admin: { allow: ['shared', 'auth'] },
    },
  },
});
```

```ts [layerscope.config.ts]
import { defineConfig } from 'nuxt-layerscope';

export default defineConfig({
  layers: {
    shared: { allow: [] },
    auth: { allow: ['shared'] },
    shop: { allow: ['shared', 'auth'] },
    admin: { allow: ['shared', 'auth'] },
  },
});
```

:::

- A layer in `layers/<name>` is called `<name>`, and the project itself is `root`. Layers from
  `extends`, npm and git are covered in [Layers](./layers#layer-names).
- Dependencies inside a layer, and on npm packages, are always allowed.
- A layer you leave out is unrestricted. Here `root` may use every layer.

### Run the check

```bash
npx layerscope check --prepare
```

`--prepare` runs `nuxi prepare` first, so the module can record what Nuxt resolved. Every
finding names the rule, the file the symbol resolves to, and the layers that are allowed:

```text
layers/admin/app/components/AdminPanel.vue
  2:14    error  Auto-import "useCart" crosses from layer "admin" into "shop"  layer-boundary
                 useCart → layers/shop/app/composables/useCart.ts
                 allowed for "admin": shared, auth

✖ 1 problem (1 error, 0 warnings)
```

The command exits with `1` when there are errors, so it fails CI.

### Add a script

```json [package.json]
{
  "scripts": {
    "lint:layers": "layerscope check --prepare"
  }
}
```

</Steps>

## Try it without installing

To see what layerscope finds before adding anything to the project:

```bash
npx nuxi prepare
npx nuxt-layerscope check
```

Without the module, layerscope reads the types Nuxt generates in `.nuxt/`. Without a config,
every layer is unrestricted, so the only findings are
[unresolved references](../reference/rules#unresolved-reference). That alone tells you whether
layerscope understands your project.

## Next steps

<CardGroup :cols="2">

<Card title="Adopt it in an existing codebase" icon="archive" to="/guide/baseline">

Accept today's violations with a baseline and block only new ones.

</Card>

<Card title="Run it in CI" icon="git-pull-request" to="/guide/ci">

Annotations on the pull request diff, with or without the GitHub Action.

</Card>

<Card title="Get feedback in the editor" icon="code" to="/guide/editor">

The ESLint and oxlint plugin reports the same findings while you type.

</Card>

<Card title="Explore dependencies" icon="search" to="/guide/explore">

Trace a symbol, draw the layer graph and find unused code.

</Card>

</CardGroup>
