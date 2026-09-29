# Rules

Rules are configured in [`rules`](./config#rules) with `off`, `warn` or `error`.

## `layer-boundary`

- Default: `error`

A file depends on a layer its own layer does not [`allow`](./config#allow).

```text
layers/admin/app/components/AdminPanel.vue
  2:14    error  Auto-import "useCart" crosses from layer "admin" into "web"  layer-boundary
                 useCart → layers/web/app/composables/useCart.ts
                 allowed for "admin": shared, auth
```

Every kind of dependency is checked:

| Kind                     | Example                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Auto-imported composable | `useCart()` in a script or <code v-pre>{{ formatPrice(total) }}</code> in a template   |
| Component                | `<CartSummary>`, `<cart-summary>`, `<LazyCartSummary>`                                 |
| Nitro server util        | `getCartStore()` in `server/api/*.ts`                                                  |
| Shared util              | `formatMoney()` from another layer's `shared/utils`                                    |
| Explicit import          | `import { useCart } from '#layers/web/app/composables/useCart'`, `~/…`, relative paths |
| Virtual module import    | `import { useCart } from '#imports'`, `import { CartSummary } from '#components'`      |

To fix a finding, either move the symbol to a layer both may use (often `shared`), or allow the
dependency if it is intended.

## `unresolved-reference`

- Default: `warn`

Something could not be resolved, so layerscope will not call it safe:

- an identifier that is neither a local binding, a known global nor an auto-import in the file's
  context,
- a component tag Nuxt has not registered,
- an import path that does not exist, or a name `#imports` / `#components` does not export,
- `<component :is>` bound to a runtime value,
- a file that could not be parsed.

```text
layers/web/app/composables/useCart.ts
  2:3     warn   "trackEvent" is not a local binding, a known global or an auto-import in the app context; if it is registered at runtime, add it to "globals" in layerscope.config.ts  unresolved-reference
```

Runtime globals from plugins belong in [`globals`](./config#globals). See
[Troubleshooting](../guide/troubleshooting#an-auto-import-is-reported-as-unresolved).

## `shadowed-component`

- Default: `warn`
- Needs the [Nuxt module](../guide/nuxt-module)

Two layers register a component with the same name, and Nuxt uses the one from the
higher-priority layer. The overridden component is reported with both paths:

```text
node_modules/@acme/ui-layer/app/components/BaseCard.vue
  1:1     warn   Component <BaseCard> of layer "ui" is overridden by layer "theme"  shadowed-component
                 BaseCard → layers/theme/app/components/BaseCard.vue
```

Overriding a component is a supported way to customize a layer, but an accidental override (two
teams picking the same name) silently changes what every other layer renders. Once an override
is intended, accept it with a [baseline](../guide/baseline) or turn the rule off.

Only components owned by a layer are reported; a project component that replaces a library
component is not. With the `.d.ts` fallback Nuxt lists only the winning component, so the rule
reports nothing and prints a note on stderr:

```text
layerscope: note: shadowed-component needs the full component registry: add "nuxt-layerscope" to "modules" in nuxt.config. …
```
