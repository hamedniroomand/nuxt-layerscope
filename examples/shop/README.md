# Example: shop

A small Nuxt 4 shop with four layers. Use it to see layerscope work in about ten minutes. It is
not the playground: the [playground](../../packages/playground) is for work on layerscope itself.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/hamedniroomand/nuxt-layerscope/tree/main/examples/shop)

Or copy only this folder to your machine:

```bash
npx giget gh:hamedniroomand/nuxt-layerscope/examples/shop my-shop
cd my-shop
npm install
```

## Layers

| Layer    | May use        | Content                                                      |
| -------- | -------------- | ------------------------------------------------------------ |
| `shared` | nothing        | `BaseButton`, `useNotice`, `formatPrice` (in `shared/utils`) |
| `auth`   | `shared`       | `LoginForm`, `useUser`, `getSessionUser`, `/api/me`          |
| `shop`   | `shared`       | `ProductCard`, `useCart`, `getProductStore`, `/api/products` |
| `admin`  | `shared`, auth | `OrdersTable`, `useOrders`, `getOrderStore`, `/api/orders`   |

`layerscope.config.ts` uses the `layered` preset, which lets each layer use `shared` only. The one
exception is `admin`, which also uses `auth`. All four rules are errors.

One finding is old on purpose: `useCart` in `shop` uses `useUser` from `auth`.
`layerscope-baseline.json` accepts it. This is how an old project starts to use layerscope.

## Try it

1. **Start the app.** Run `npm run dev`. Press <kbd>Shift</kbd> + <kbd>Alt</kbd> + <kbd>D</kbd>,
   select **Layerscope**, or open `/__layerscope`. The tab shows no new findings. The baseline
   holds one.
2. **Run the check.** Run `npm run check`. It prints `No problems` and exits with code 0.
3. **Add violations.** Run `npm run break`. It copies the files in [`violations/`](./violations)
   into the project: one violation for each rule. Run `npm run check` again. It exits with code
   1. The DevTools tab updates by itself.
4. **Ask questions.** Run `npm run why` (who uses `useCart`), `npm run fix` (what to move, with
   no change made) and `npm run graph` (a Mermaid graph of the layers).
5. **Go back.** Run `npm run reset` to remove the violation files. If the DevTools tab still shows
   the `shadowed-component` finding, restart `npm run dev`: the tab keeps the list of components
   until Nuxt starts again.

The check reports 9 problems. The table shows the six causes; the other three follow from them (a
cycle through `OrdersTable`, a cycle through `AccountMenu`, and `LoginForm` that now gets the
`BaseButton` of `shop`).

| File in `violations/`                           | Rule                   | What it shows                                   |
| ----------------------------------------------- | ---------------------- | ----------------------------------------------- |
| `layers/shared/app/composables/useCartBadge.ts` | `layer-boundary`       | An auto-import from a layer that is not allowed |
| `layers/auth/app/components/AccountMenu.vue`    | `layer-boundary`       | A component from a layer that is not allowed    |
| `layers/shop/server/api/order-count.get.ts`     | `layer-boundary`       | A Nitro util from a layer that is not allowed   |
| `layers/shared/app/composables/useCartBadge.ts` | `layer-cycle`          | `shared` and `shop` use each other              |
| `layers/shop/app/utils/track.ts`                | `unresolved-reference` | `analytics` is not a name that Nuxt can find    |
| `layers/shop/app/components/BaseButton.vue`     | `shadowed-component`   | `shop` replaces `BaseButton` from `shared`      |

## Run it in CI

[`ci/layerscope.yml`](./ci/layerscope.yml) is a sample workflow. It uses the layerscope Action,
which writes the findings as annotations on the pull request and posts the drift report as a
comment. Copy it to `.github/workflows` in your own repository.

`layerscope drift` needs git, so it does not run on StackBlitz.

## How this repository tests it

`node scripts/verify-example.mjs` (from the repository root) copies the example and the
violation files to a temporary folder. It checks that the example exits with code 0, and that the
violations exit with code 1 with the findings in the table above. It never changes your files.
