# Deploying the playground

`nuxi build` and `nuxi generate` write a read-only snapshot of the Layerscope tab to
`/__layerscope/` (`layerscope: { devtools: { static: true } }` in `nuxt.config.ts`). The host only
serves files: it runs no analysis.

The playground loads the module from source, so the tab's client must be built first. Both commands
below build it; without it the build fails with "The DevTools client is not built".

The commands use `pnpm` scripts, because the `vp` command is not installed on the hosts.

## Netlify

| Setting           | Value                                                                           |
| ----------------- | ------------------------------------------------------------------------------- |
| Base directory    | (empty: the repository root)                                                    |
| Build command     | `pnpm --filter nuxt-layerscope build && pnpm --filter playground generate:demo` |
| Publish directory | `packages/playground/.output/public`                                            |

The output is static files only. The tab is at `/__layerscope/`.

## Vercel

| Setting          | Value                                                                        |
| ---------------- | ---------------------------------------------------------------------------- |
| Root Directory   | `packages/playground`                                                        |
| Framework Preset | Nuxt.js                                                                      |
| Build Command    | `pnpm --filter nuxt-layerscope build && pnpm --filter playground build:demo` |

Keep "Include files outside of the Root Directory in the Build Step" on (the default), so the
workspace install and the `nuxt-layerscope` package are available. Nuxt's Vercel preset puts the
snapshot in `.vercel/output/static/__layerscope/`, which Vercel serves before the server function.

## Check it locally

```sh
pnpm --filter nuxt-layerscope build && pnpm --filter playground generate:demo
cd packages/playground/.output/public && python3 -m http.server 4321
```

Then open `http://localhost:4321/__layerscope/`.
