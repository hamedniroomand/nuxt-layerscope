# DevTools

While `nuxi dev` runs, the [Nuxt module](./nuxt-module) adds a **Layerscope** tab to
[Nuxt DevTools](https://devtools.nuxt.com). Open DevTools with <kbd>Shift</kbd> + <kbd>Alt</kbd> +
<kbd>D</kbd>, or the Nuxt icon at the bottom of the page, and pick the tab.

The tab shows:

- every layer, its root, and the layers it may depend on,
- the current findings, with the rule, the message and where the symbol resolves to,
- a note when something looks off, such as a layer whose `srcDir` does not exist.

Click a file name to open it in your editor at the reported line.

The tab reads `layerscope-baseline.json`, so findings you accepted with a [baseline](./baseline) are
left out and counted as "in baseline" in the summary, the same as `layerscope check`.

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

## JSON API

The same server answers a few JSON endpoints under `/__layerscope/api`:

| Request           | Response                                                    |
| ----------------- | ----------------------------------------------------------- |
| `GET /api/state`  | Revision, when the last analysis ran and how long it took.  |
| `GET /api/report` | The state plus the `layerscope check --format json` report. |
| `POST /api/rerun` | Analyzes again and returns the same body as `/api/report`.  |

Responses carry the revision as an `ETag`, so a request with a matching `If-None-Match` gets a
`304`. The revision only changes when the findings, layers or notes change.

Analysis is lazy and cached per file: nothing runs until the tab is opened, and a re-run only reads
files that changed since the last one.

## Turning it off

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['nuxt-layerscope'],
  layerscope: { devtools: false },
});
```

The tab only exists in development. Production builds contain no layerscope code.
