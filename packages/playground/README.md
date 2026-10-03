# playground

A small Nuxt 4 app to try the Layerscope DevTools tab and the CLI by hand. Edit it freely while
you try something, but read the note on intentional findings first.

```sh
vp run playground          # from the repository root: builds the tab, then starts nuxi dev
```

Open the printed URL, press <kbd>Shift</kbd> + <kbd>Alt</kbd> + <kbd>D</kbd> and select
**Layerscope**, or open `/__layerscope`. Run `vp run playground#check` for the CLI report; it exits with code 1, because of the
errors that are there on purpose.

The module comes from `packages/layerscope/src`, so changes to the analyzer or the dev server need
no build. The tab's client comes from `packages/layerscope/dist/devtools`: run
`vp run nuxt-layerscope#build` after you change it, then reload.

## Layers

Four layers in `layers/`, each allowed to use the layers below it (`layerscope.config.ts`):

| Layer   | May use        | Content                                               |
| ------- | -------------- | ----------------------------------------------------- |
| `admin` | shop, ui, base | `AdminPanel`, `useOrders`, `exportCsv`, `/api/orders` |
| `shop`  | ui, base       | `CartSummary`, `useCart`, `getCartStore`, `/api/cart` |
| `ui`    | base           | `AppCard`, `AppButton`, `AppBadge`, `useToast`        |
| `base`  | nothing        | `AppButton`, `useTheme`, `formatPrice`, `formatDate`  |

The app itself (`root`) may use every layer.

## Intentional findings

These are on purpose, and a comment in each file says so. `test/playground.test.ts` in
`packages/layerscope` pins them: if you change one, update the test too.

| File                                       | Rule                   | What it shows                                                |
| ------------------------------------------ | ---------------------- | ------------------------------------------------------------ |
| `layers/ui/app/components/AppCard.vue`     | `layer-boundary`       | A low layer that reaches up: `ui` uses `useCart` from `shop` |
| `layers/shop/app/composables/useCart.ts`   | `layer-boundary`       | `shop` uses `useOrders` from `admin`                         |
| `layers/base/app/composables/useTheme.ts`  | `layer-boundary`       | `base` uses `useToast` from `ui`; accepted in the baseline   |
| `layers/base/app/components/AppButton.vue` | `shadowed-component`   | `ui` has its own `AppButton`, which replaces this one        |
| `layers/admin/app/utils/exportCsv.ts`      | `unresolved-reference` | `analytics` is a global that a script adds at runtime        |
| `app/pages/admin.vue`                      | `unresolved-reference` | `<component :is>` with a runtime value; Unused shows a note  |

Two auto-imports have no users, so the Unused view lists them: `formatDate` in `base` and
`AppBadge` in `ui`.

`layerscope-baseline.json` holds the one accepted finding, as `layerscope check --update-baseline`
writes it. If you try Ignore in the tab, restore the file with `git checkout` when you are done.

## Deploying

`nuxi build` and `nuxi generate` also write a read-only snapshot of the tab to `/__layerscope/`,
and the home page links to it. [DEPLOY.md](./DEPLOY.md) has the Netlify and Vercel settings.

## Notes

- The docs screenshots come from this app (`vp run docs#screenshots`). After a change here, run
  that script again, and check the numbers in the DevTools guide.
- The linter skips this package: like the test fixtures, it relies on Nuxt auto-imports that the
  linter cannot see. Formatting still applies.
- It has no `build` script, only `build:demo` and `generate:demo`, so CI does not build it. Keep it
  free of secrets and machine paths: the deployed snapshot is public.
- To experiment, use this app, not the fixtures under `packages/layerscope/test`: tests pin those.
