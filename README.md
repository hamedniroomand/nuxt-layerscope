<p align="center">
  <img src="./packages/docs/public/logo.svg" width="96" height="96" alt="layerscope logo">
</p>

<h1 align="center">layerscope</h1>

<p align="center">
  Layer boundary checks for Nuxt, auto-imports included.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/nuxt-layerscope"><img src="https://img.shields.io/npm/v/nuxt-layerscope?color=00dc82&label=npm" alt="npm version"></a>
  <a href="https://github.com/hamedniroomand/nuxt-layerscope/actions/workflows/ci.yml"><img src="https://github.com/hamedniroomand/nuxt-layerscope/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/nuxt-layerscope?color=22d3ee" alt="MIT license"></a>
  <a href="https://hamedniroomand.github.io/nuxt-layerscope/"><img src="https://img.shields.io/badge/docs-layerscope-00dc82" alt="Documentation"></a>
</p>

---

A component in `admin` that calls an auto-imported composable from `web` has no `import`
statement, so import-based boundary tools never see it. layerscope resolves auto-imports,
components, Nitro server utils and regular imports the same way Nuxt does, and fails CI when a
layer uses something it isn't allowed to.

- Works with Nuxt 3 and 4, local, npm and remote layers
- Checks the app, `server/` and `shared/`
- Baselines for existing projects, SARIF and a GitHub Action for CI
- `why`, `graph` and `unused` commands, an ESLint plugin and a DevTools tab

## Quick start

```bash
npx nuxi module add nuxt-layerscope --dev
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-layerscope'],
  layerscope: {
    layers: {
      shared: { allow: [] },
      shop: { allow: ['shared'] },
      admin: { allow: ['shared'] },
    },
  },
});
```

```bash
npx layerscope check --prepare
```

Read the [getting started guide](https://hamedniroomand.github.io/nuxt-layerscope/guide/getting-started)
for the full setup.

## Documentation

Everything else lives at **[hamedniroomand.github.io/nuxt-layerscope](https://hamedniroomand.github.io/nuxt-layerscope/)**:
[CLI](https://hamedniroomand.github.io/nuxt-layerscope/reference/cli),
[config](https://hamedniroomand.github.io/nuxt-layerscope/reference/config),
[rules](https://hamedniroomand.github.io/nuxt-layerscope/reference/rules),
[CI](https://hamedniroomand.github.io/nuxt-layerscope/guide/ci) and
[troubleshooting](https://hamedniroomand.github.io/nuxt-layerscope/guide/troubleshooting).

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) to get set up.

## License

[MIT](./LICENSE) © Hamed Niroomand
