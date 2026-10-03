# DevTools

While `nuxi dev` runs, the [Nuxt module](./nuxt-module) adds a **Layerscope** tab to
[Nuxt DevTools](https://devtools.nuxt.com). The tab shows the layer architecture of the app and
updates while you edit code.

## Open the tab

Open DevTools with <kbd>Shift</kbd> + <kbd>Alt</kbd> + <kbd>D</kbd>, or click the Nuxt icon at the
bottom of the page. Then select **Layerscope** in the sidebar.

In a small window, DevTools puts tabs that are not pinned in the sidebar menu (<kbd>⋮</kbd>). Pin
the Layerscope tab there to keep it in the sidebar. You can also open the tab without DevTools, at
`/__layerscope` on the dev server.

## The views

The bar at the top shows the file and layer counts, the errors and warnings, the findings that the
[baseline](./baseline) accepts, and when the last analysis ran. **Re-run** analyzes again.

| View         | Key | What it shows                                                                            |
| ------------ | --- | ---------------------------------------------------------------------------------------- |
| **Overview** | `1` | The counts, a small layer graph, the files with the most findings, and notes.            |
| **Findings** | `2` | Every finding, with filters for severity, rule, layer pair, file and text, and grouping. |
| **Trace**    | `3` | Every use of a component or auto-import, grouped by layer, as `layerscope why` shows it. |
| **Unused**   | `4` | Components and auto-imports that nothing uses, as `layerscope unused` shows them.        |
| **Graph**    | `5` | The layers and their dependencies. Violations are dashed lines with an `!N` badge.       |
| **Baseline** | `6` | The findings that the baseline accepts, and entries that no longer match a finding.      |

Every count is a link. For example, click **5 errors** to see only the errors in **Findings**.
Click a file name to open the file in your editor at that line. The pictures below show the
`nuxt4` test project of this repository.

### Overview

The counts, a small copy of the graph, and the files with the most findings. Press <kbd>1</kbd>.

<Screenshot
  name="overview"
  alt="The Overview view: 21 files in 6 layers, 5 errors and 2 warnings, a small layer graph, and the six files that have findings."
/>

### Findings

Every finding, grouped by rule, file or layer pair. Filter by severity, rule, layer pair, file or
text; the filters stay in the URL. Press <kbd>2</kbd>, then <kbd>/</kbd> to filter.

<Screenshot
  name="findings"
  alt="The Findings view: 7 findings in two groups, layer-boundary with 5 errors and unresolved-reference with 2 warnings."
/>

Select a finding with <kbd>j</kbd> and <kbd>k</kbd>. The selected finding shows a suggestion from
the analysis: move the file, allow the layer, or leave the reference. For an "allow" suggestion, the
tab shows the config change to copy and how many findings it removes. The tab does not change your
config. <kbd>o</kbd> opens the file, <kbd>t</kbd> traces the symbol, and <kbd>i</kbd> accepts the
finding into the baseline.

<Screenshot
  name="findings-selected"
  alt="The first finding selected: admin uses useCart from web. The suggestion allows admin to use web, which resolves 4 findings in 3 files, with the config snippet and the Ignore, Trace and Open buttons."
/>

### Trace

Every use of a component or auto-import, grouped by layer, as `layerscope why` shows it. Press
<kbd>3</kbd>, or <kbd>t</kbd> on a finding.

<Screenshot
  name="trace"
  alt="The Trace view for useCart: 2 uses in 2 layers, not allowed from admin and in the same layer from web."
/>

### Unused

Components and auto-imports that nothing uses, as `layerscope unused` shows them. Press
<kbd>4</kbd>.

<Screenshot
  name="unused"
  alt="The Unused view: 4 unused symbols in 2 layers, the CartBadge component in web and three auto-imports in admin."
/>

### Graph

The graph reads from left to right: a layer depends on the layers to its right. A line is thicker
when it carries more references. Violations are dashed lines with an `!N` badge. Click a layer to
see its files and the layers it uses. Click a line to see the symbols and files behind it. Press
<kbd>5</kbd>, and <kbd>e</kbd> to go through the lines of the selected layer.

<Screenshot
  name="graph"
  alt="The Graph view: six layers, the admin to web edge selected, and the side panel lists four symbols with their kinds."
/>

**Table** shows the same data as a matrix: rows use the layers in the columns. Above 15 layers, the
view opens on the table, and the graph is one click away.

### Baseline

The findings that the [baseline](./baseline) accepts, and entries that no longer match a finding.
Press <kbd>6</kbd>.

<Screenshot
  name="baseline"
  alt="The Baseline view: 2 warnings accepted into layerscope-baseline.json, each with a Remove from baseline button."
/>

## Live updates

When the tab is open, it analyzes again 200 ms after you save a file. A message at the bottom says
what changed, for example "+2 violations, -1 fixed". Findings that are new since you opened the tab
have a `NEW` mark. **New only** shows only those findings, and <kbd>n</kbd> goes to the next one.
**Reset marker** makes the current findings the new starting point.

**Pause** (<kbd>p</kbd>) stops the live updates. While the tab is closed, hidden behind another
DevTools tab, or paused, a saved file causes no analysis.

## Accept findings into the baseline

You can add findings to `layerscope-baseline.json` from the tab:

- one finding: select it and press <kbd>i</kbd>, or click **Ignore**,
- some findings: pick them with the check boxes (or <kbd>x</kbd>, and shift-click for a range),
  then click **Ignore picked**,
- a group: click **Ignore all N** next to the group name.

The tab asks first, inline, and says how many entries, findings and files the change adds. Click
**Undo** within 10 seconds to restore the file. The **Baseline** view keeps an **Undo** button
until the next change, and can remove entries.

The file that the tab writes is the same file that `layerscope check --update-baseline` writes for
those findings. Commit it to share it with your team.

### Why this is safe

The baseline write is the only change the tab makes to your files. The dev server accepts it only
when all of these are true:

- the request comes from the same origin as the tab,
- the request carries a random token that only the tab has, created each time the dev server
  starts,
- the request names findings by their key, and the server finds them in its own last analysis,
- the findings did not change since the tab loaded them. If they did, the server refuses with
  `409`, and the tab loads the new findings.

The server writes one change at a time, and always to `layerscope-baseline.json` in the project
root. The tab cannot read or use the `--baseline` path of the CLI.

## Keyboard shortcuts

| Key                          | Action                                        |
| ---------------------------- | --------------------------------------------- |
| <kbd>1</kbd> to <kbd>6</kbd> | Go to a view                                  |
| <kbd>/</kbd>                 | Filter the findings                           |
| <kbd>r</kbd>                 | Re-run                                        |
| <kbd>j</kbd> / <kbd>k</kbd>  | Next or previous finding                      |
| <kbd>o</kbd>                 | Open the selected finding in your editor      |
| <kbd>t</kbd>                 | Trace the symbol of the selected finding      |
| <kbd>i</kbd>                 | Ignore the selected finding (asks first)      |
| <kbd>x</kbd>                 | Pick the selected finding for a bulk action   |
| <kbd>n</kbd>                 | Go to the next new finding                    |
| <kbd>p</kbd>                 | Pause or resume live updates                  |
| <kbd>e</kbd>                 | In the graph, go through the lines of a layer |
| <kbd>Esc</kbd>               | Leave a field, or clear the selection         |
| <kbd>?</kbd>                 | Show all shortcuts                            |

Keys have no effect while you type in a field, except <kbd>Esc</kbd>.

## Theme

The tab uses the light or dark theme of DevTools, and changes when DevTools changes. When you open
`/__layerscope` directly, it uses the theme of your system.

## JSON API

The tab gets all of its data from JSON endpoints under `/__layerscope`. You can use them in your
own scripts while the dev server runs.

| Request                                         | Response                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------- |
| `GET /?format=json`                             | The same report as `layerscope check --format json`.                        |
| `GET /api/state`                                | The revision, when the last analysis ran, and the live state.               |
| `GET /api/report`                               | The report for the tab: findings with keys, suggestions and statistics.     |
| `GET /api/symbols`                              | The names that Trace accepts, with their kind and layer.                    |
| `GET /api/trace?symbol=useCart`                 | Every use of a symbol, as `layerscope why --format json` shows it.          |
| `GET /api/unused`                               | Unused components and auto-imports.                                         |
| `GET /api/baseline`                             | The accepted findings and the entries that no longer match.                 |
| `GET /api/graph`                                | Layers, dependencies and the matrix. Add `?layout=1` above 15 layers.       |
| `GET /api/edge?from=A&to=B`                     | The symbols and files behind one dependency, at most 500.                   |
| `GET /api/node?layer=A`                         | One layer, the layers it uses and is used by, and its files, 200 at a time. |
| `POST /api/rerun`                               | Analyzes again and returns the report.                                      |
| `POST /api/live/pause`, `/resume`               | Stops or starts live updates.                                               |
| `POST /api/live/marker`                         | Makes the current findings the starting point for `NEW`.                    |
| `POST /api/baseline/ignore`, `/remove`, `/undo` | Changes the baseline file. Needs the token of the tab (see above).          |

`GET` responses carry an `ETag`. A request with a matching `If-None-Match` gets `304`. Unknown
layers get `404`. A `POST` from another origin gets `403`.

### Events

`GET /__layerscope/events` is a stream of server-sent events. While a stream is open, a saved file
starts an analysis.

| Event      | When                                   | Data                                                                    |
| ---------- | -------------------------------------- | ----------------------------------------------------------------------- |
| `state`    | On connect, pause and resume           | `{ live: { clients, paused } }`                                         |
| `snapshot` | After each analysis or baseline change | Revision, timing, counts, `delta.added` and `delta.removed`, `newCount` |
| `error`    | When a live analysis fails             | `{ error }`                                                             |
| `ping`     | Every 25 seconds                       | Empty. It keeps proxies from closing the stream.                        |

## Performance

The tab costs nothing until you open it: no analysis runs, and production builds contain no
layerscope code. When it is open, the analysis gives the event loop of the dev server a turn
between small batches of work, so HMR stays fast.

Measured on 2026-10-03 on an Apple Silicon laptop. "Synthetic" is a generated project with 12
layers, 1,980 files and 1,687 findings.

| Measurement                                     | nuxt4 fixture (21 files) | Synthetic  |
| ----------------------------------------------- | ------------------------ | ---------- |
| First analysis                                  | 59–92 ms                 | 556–829 ms |
| Analysis after a one-file change (median)       | 3–4 ms                   | 38–40 ms   |
| Longest block of the event loop, after a change | 2–4 ms                   | 7–12 ms    |
| Analysis after the symbol registry changes      | 21 ms                    | 523 ms     |
| Memory of the analysis after 10 changes         | +3 MB                    | +14 MB     |
| Accepting a finding into the baseline           | 2–4 ms                   |            |
| Tab ready after its script loads                | 10–12 ms                 | 12 ms      |
| Browser tasks over 50 ms (scroll, graph zoom)   | none                     | none       |

When you add or remove a file, the analysis loads the symbol registry again. On the synthetic
project this is one block of about 65 ms on the dev server. Edits to existing files do not cause
it.

The tab downloads 44 KB (gzip) when it opens, and 7 KB more when it first shows the graph.

How it was measured: the server numbers come from a script that runs the analysis like the tab does
and records the longest time between two event-loop turns. The browser numbers come from Chrome
with a `PerformanceObserver` for long tasks. A test in CI checks that an analysis after a one-file
change takes less than 500 ms on the nuxt4 fixture.

## Turn the tab off

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['nuxt-layerscope'],
  layerscope: { devtools: false },
});
```

The tab exists only in development. Production builds contain no layerscope code.
