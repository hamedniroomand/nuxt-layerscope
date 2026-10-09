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

| Option       | Type                              | Default                       | Description                                                 |
| ------------ | --------------------------------- | ----------------------------- | ----------------------------------------------------------- |
| `rootDir`    | `string`                          | `process.cwd()`               | Nuxt project root                                           |
| `configFile` | `string`                          | `layerscope.config.*` in root | Config file path                                            |
| `config`     | `LayerscopeConfig`                |                               | Config object, used instead of loading a file               |
| `prepare`    | `boolean`                         | `false`                       | Run `nuxi prepare` first                                    |
| `source`     | `'auto' \| 'registry' \| 'types'` | `'auto'`                      | Where symbols come from                                     |
| `baseline`   | `string`                          |                               | Baseline file, relative to the root; applied when it exists |

### `AnalyzeResult`

```ts
interface AnalyzeResult {
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
  /** Files that render a component chosen at runtime. */
  dynamicComponentFiles: string[];
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
Paths are relative to `cwd`, which defaults to `process.cwd()`. The `sarif` and `gitlab` formats
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

The components and auto-imports `layerscope unused` lists. Each entry has `name`, `kind`
(`component` or `auto-import`), `context`, `file`, `layer` and `possiblyUsed`.

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
