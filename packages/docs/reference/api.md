# JavaScript API

The analysis is available from `nuxt-layerscope/api`, for custom reports, scripts or other tools.

```ts
import { analyze, formatResult } from 'nuxt-layerscope/api';

const result = await analyze({ rootDir: 'apps/shop' });

if (result.findings.some(finding => finding.severity === 'error')) {
  process.stdout.write(formatResult(result, 'text'));
  process.exitCode = 1;
}
```

The main entry, `nuxt-layerscope`, is the Nuxt module plus `defineConfig` and the types. It stays
small because Nuxt loads it at startup; the API is a separate entry for that reason.

## `analyze(options?)`

Runs a check and resolves to an `AnalyzeResult`. Throws `LayerscopeError` for config and input
problems (the CLI's exit code `2`).

| Option       | Type                              | Default                       | Description                                                                                                                            |
| ------------ | --------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `rootDir`    | `string`                          | `process.cwd()`               | Nuxt project root                                                                                                                      |
| `configFile` | `string`                          | `layerscope.config.*` in root | Config file path, relative to `rootDir`                                                                                                |
| `config`     | `LayerscopeConfig`                |                               | Config object, used instead of loading a file                                                                                          |
| `prepare`    | `boolean`                         | `false`                       | Run `nuxi prepare` first                                                                                                               |
| `source`     | `'auto' \| 'registry' \| 'types'` | `'auto'`                      | Where symbols come from                                                                                                                |
| `baseline`   | `string \| true`                  |                               | Baseline file, relative to the root, applied when it exists. `true`: the `baseline` key of the config, else `layerscope-baseline.json` |
| `extraFiles` | `boolean`                         | `false`                       | See below                                                                                                                              |

`extraFiles`: also read `nuxt.config.*`, the Nuxt `modules/` dir, files of extra auto-import and
component dirs, and the project files that counted files import, so that `unused` counts their
uses. Default `false`. The rules never see these files.

### `AnalyzeResult`

```ts
interface AnalyzeResult {
  /** The real path of the root: symlinks resolved, case from the disk, `/` as separator. */
  rootDir: string;
  /** The config that applied: layerscope.config.* or the layerscope key of nuxt.config. */
  config: LayerscopeConfig;
  source: 'registry' | 'types';
  /** File the symbols were read from. */
  sourceFile: string;
  /** Highest priority first. */
  layers: Layer[];
  /** Checked files, sorted. */
  files: string[];
  /** Every resolved reference: file → target file and layer, or package. */
  edges: Edge[];
  findings: Finding[];
  notes: string[];
  /** Every auto-import and component Nuxt registered, per context. */
  symbols: SymbolTable;
  /** The edges of the extra files, with `extraFiles`. Only `findUnused` reads them. */
  extraEdges: Edge[];
  /**
   * The uses in type positions (`typeof x`, and `import type` when `typeImports` is `'ignore'`).
   * With `extraFiles`, it also holds the type uses of the extra files. Only `findUnused` reads
   * them.
   */
  typeEdges: Edge[];
  /**
   * Files that render a component chosen at runtime.
   * Can hold extra files that are not in `files`.
   */
  dynamicComponentFiles: string[];
  /**
   * Files with code that layerscope cannot read. Each file is an absolute path.
   * Can hold extra files that are not in `files`.
   */
  unreadFiles: { file: string; reason: string }[];
  /** With a baseline: accepted findings and fixed entries. `findings` then holds only new ones. */
  baseline?: { file: string; suppressed: Finding[]; removable: BaselineEntry[] };
}
```

All paths are absolute. `Layer`, `Edge`, `Finding` and the other types are exported from both
entries:

```ts
import type { AnalyzeResult, Edge, Finding, Layer } from 'nuxt-layerscope';
```

## `formatResult(result, format, cwd?, paint?, repoRoot?)`

Formats a result as `'text'`, `'github'`, `'json'`, `'sarif'` or `'gitlab'`, exactly like the CLI.
Paths are relative to `cwd`, which defaults to the real path of the current directory (symlinks
resolved, case from the disk). The `sarif` and `gitlab` formats
use paths relative to `repoRoot` instead, which defaults to the project root. The CLI passes the
git root of the project there.

## `createBaseline(findings, rootDir)`

Builds the baseline the CLI writes with `--update-baseline`:

```ts
import { writeFileSync } from 'node:fs';

import { analyze, createBaseline } from 'nuxt-layerscope/api';

const result = await analyze();
writeFileSync(
  'layerscope-baseline.json',
  `${JSON.stringify(createBaseline(result.findings, result.rootDir), null, 2)}\n`,
);
```

## `buildGraph(result, config, level)`

The dependency graph `layerscope graph` prints, as data. `level` is `'layer'` or `'file'`.

```ts
import { analyze, buildGraph } from 'nuxt-layerscope/api';

const result = await analyze();
const graph = buildGraph(result, result.config, 'layer');

for (const edge of graph.edges.filter(edge => edge.status === 'not-allowed')) {
  console.log(`${edge.from} → ${edge.to} (${edge.count} references)`);
}
```

Each edge has `from`, `to`, `count` and `status`, the worst status of the references behind it.

## `findUnused(result)`

The components and auto-imports `layerscope unused` lists. It counts the uses in the extra files
only when `result` comes from `analyze` with `extraFiles: true`. Each entry has `name`, `kind`
(`component` or `auto-import`), `context`, `file`, `layer` and `possiblyUsed`.

## `findBlindSpots(result)`

What `layerscope unused` does not see in this run. Each entry has a `kind`: `test-files`, `ignored`
(the config has `ignore` patterns), `package-layers` (a layer is installed as a package),
`unreadable` or `outside-root`. An `unreadable` entry also has `files`: the files that layerscope
could not read, each with a `file` (an absolute path) and a `reason`. An `outside-root` entry has
`layers`: the names of the layers outside the project root that are not installed as packages.
`findUnused` does not list their symbols.

## `defineConfig(config)`

Returns the config unchanged, typed. Exported from `nuxt-layerscope` and `nuxt-layerscope/api`.

## Constants

| Export                | Value                                                   |
| --------------------- | ------------------------------------------------------- |
| `OUTPUT_FORMATS`      | `['text', 'github', 'json']`                            |
| `JSON_REPORT_VERSION` | Version of the JSON report                              |
| `BASELINE_FILE`       | `'layerscope-baseline.json'`                            |
| `BASELINE_VERSION`    | Version of the baseline file                            |
| `REGISTRY_FILE`       | `'layerscope/registry.json'`, relative to the build dir |
| `REGISTRY_VERSION`    | Version of the registry schema                          |
