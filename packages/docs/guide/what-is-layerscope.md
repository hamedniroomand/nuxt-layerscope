# What is layerscope?

layerscope checks that the [layers](https://nuxt.com/docs/getting-started/layers) of a Nuxt 3 or
Nuxt 4 app only depend on the layers they are allowed to, and fails CI when one does not.

## The problem

Nuxt layers are a good way to split a large app into parts: a `shared` layer with the design
system, an `auth` layer, a `shop` layer, an `admin` layer. Such a modular monolith only stays
modular if the parts respect their boundaries, for example "`admin` may use `shared` and
`auth`, but not `shop`".

Tools that enforce boundaries usually read `import` statements. In Nuxt most dependencies have
none:

```vue
<!-- layers/admin/app/components/AdminPanel.vue -->
<script setup lang="ts">
  // Auto-imported from layers/web/app/composables/useCart.ts
  const cart = useCart();
</script>

<template>
  <!-- Registered from layers/web/app/components/CartSummary.vue -->
  <CartSummary />
</template>
```

Composables, utils, components and Nitro server utils are all auto-imported, so an import-based
tool sees nothing wrong here.

## What layerscope does

layerscope resolves every identifier and component tag that Nuxt would auto-import, and every
explicit import, to the file it comes from and to the layer that owns the file. It then checks
each edge against your rules:

```text
layers/admin/app/components/AdminPanel.vue
  2:14    error  Auto-import "useCart" crosses from layer "admin" into "web"  layer-boundary
                 useCart → layers/web/app/composables/useCart.ts
                 allowed for "admin": shared, auth
  8:5     error  Component <CartSummary> crosses from layer "admin" into "web"  layer-boundary
                 CartSummary → layers/web/app/components/CartSummary.vue
                 allowed for "admin": shared, auth
```

- **Exact resolution.** Symbols are resolved from what Nuxt registered, not guessed from file
  names. Layer priority, overridden components, `pathPrefix`, custom component dirs and
  module-provided auto-imports (such as `@vueuse/nuxt`) all come out the way Nuxt sees them.
- **Nuxt layer semantics.** Layers are named and ordered the way Nuxt names and orders them.
  Layers from `layers/`, `extends`, npm packages and git repositories are all supported.
- **A CI gate.** It exits non-zero on errors, annotates pull requests and writes versioned JSON.
- **Adoptable.** A [baseline](./baseline) lets you turn the check on in a codebase that already
  has violations.

## What it is not

layerscope is deliberately narrow. It is not a general architecture analyzer (cycles, churn,
bundle size) and not a linter for code style. It answers one question precisely: _does each layer
only depend on the layers it is allowed to?_ See [compared with other tools](./comparison).

<ReadMore to="/guide/getting-started" title="Getting started" />
