# DevTools

While `nuxi dev` runs, the [Nuxt module](./nuxt-module) adds a **Layerscope** tab to
[Nuxt DevTools](https://devtools.nuxt.com). Open DevTools with <kbd>Shift</kbd> + <kbd>Alt</kbd> +
<kbd>D</kbd>, or the Nuxt icon at the bottom of the page, and pick the tab.

The tab shows:

- every layer, its root, and the layers it may depend on,
- the current findings, with the rule, the message and where the symbol resolves to,
- a note when something looks off, such as a layer whose `srcDir` does not exist.

Click a file name to open it in your editor at the reported line.

## When it updates

The tab runs the same analysis as `layerscope check` every time you open it or press **Re-run**.
The layers and symbols it reads are rewritten by Nuxt when components or auto-imports are added
or removed, so a new file shows up without restarting the dev server.

## The report as JSON

The tab is served from `/__layerscope`. Add `?format=json` to get the same JSON report as
`layerscope check --format json`, which is handy for a quick script against a running dev
server:

```bash
curl -s http://localhost:3000/__layerscope?format=json
```

## Turning it off

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['nuxt-layerscope'],
  layerscope: { devtools: false },
});
```

The tab only exists in development. Production builds contain no layerscope code.
