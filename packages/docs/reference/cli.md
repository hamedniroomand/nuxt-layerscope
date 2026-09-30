# CLI

The package installs a `layerscope` command. Without installing, run it as
`npx nuxt-layerscope`.

```bash
layerscope <command> [options]
```

| Command                                  | Description                                           |
| ---------------------------------------- | ----------------------------------------------------- |
| [`init [root]`](#layerscope-init)        | Write a starter config from today's dependencies      |
| [`drift [root]`](#layerscope-drift)      | Say how many violations the code adds and fixes       |
| [`fix [root]`](#layerscope-fix)          | Print the file moves that would fix boundary findings |
| [`check [root]`](#layerscope-check)      | Check layer boundaries, including auto-imports        |
| [`why <symbol> [root]`](#layerscope-why) | List every use of a symbol and the layers it crosses  |
| [`graph [root]`](#layerscope-graph)      | Print the dependency graph between layers or files    |
| [`unused [root]`](#layerscope-unused)    | List components and auto-imports nothing references   |

`root` is the Nuxt project root and defaults to the current directory. `layerscope --help` and
`layerscope <command> --help` print the options.

## `layerscope init`

```bash
layerscope init [root] [options]
```

Writes `layerscope.config.ts` with every layer and the smallest `allow` map under which the project
passes. It prints the layers, every allowed edge and a readiness report: how many references could
not be resolved and where they cluster. Project code is never changed. See
[Getting started](../guide/getting-started#generate-a-starting-config).

| Option            | Default                | Description                                                  |
| ----------------- | ---------------------- | ------------------------------------------------------------ |
| `--config <file>` | `layerscope.config.ts` | Where to write the config, relative to the current directory |
| `--baseline`      |                        | Also write a baseline of the findings still reported         |
| `--force`         |                        | Replace an existing config or baseline                       |
| `--dry-run`       |                        | Print the proposal and write nothing                         |

Also takes `--prepare`, `--source` and `--verbose`. Without `--force`, `init` exits `2` when a
config already exists, or a baseline with `--baseline`. It does not merge: use `--dry-run` and copy
the edges you want.

## `layerscope check`

```bash
layerscope check [root] [options]
```

| Option              | Default                    | Description                                                   |
| ------------------- | -------------------------- | ------------------------------------------------------------- |
| `--format <format>` | `text`                     | [Output format](./output): `text`, `github` or `json`         |
| `--config <file>`   | `layerscope.config.*`      | Config file, relative to the current directory                |
| `--prepare`         |                            | Run `nuxi prepare` before checking                            |
| `--source <source>` | `auto`                     | [Symbol source](#source): `auto`, `registry` or `types`       |
| `--baseline <file>` | `layerscope-baseline.json` | [Baseline](../guide/baseline) file, relative to the root      |
| `--update-baseline` |                            | Write every current finding to the baseline file and exit `0` |
| `--verbose`         |                            | Print where symbols were read from                            |

```bash
layerscope check                                  # current directory
layerscope check apps/shop --format github        # another root, GitHub annotations
layerscope check --prepare --source registry      # regenerate, and require the module
layerscope check --update-baseline                # accept the current findings
```

## `layerscope drift`

```bash
layerscope drift [root] [--base origin/main] [--format text|markdown|json]
```

Compares the violations the code has now with the [baseline](../guide/baseline) committed on the
base ref, and prints `adds 3, fixes 5`, the entries behind both, and the baseline size on the base
and now. A base without a baseline file counts as empty. Also takes `--baseline`, `--config`,
`--prepare` and `--source`. Exits `0`, and `2` for an unknown ref.

## `layerscope fix`

```bash
layerscope fix [root] --dry-run
```

Prints the file moves asked for by the [suggestions](./rules#suggestions) on boundary findings, and
the explicit imports each move breaks with their new specifier. Auto-imports and components need
no update. Only relative specifiers are rewritten; aliases are listed as "update by hand".
`--dry-run` is required: nothing is moved. Also takes `--config`, `--prepare`, `--source` and
`--verbose`.

## `layerscope why`

```bash
layerscope why <symbol> [root] [options]
```

`symbol` is an auto-import (`useCart`), a component (`BaseButton`, `base-button`,
`LazyBaseButton`) or an import specifier (`#layers/web/app/composables/useCart`). See
[Explore dependencies](../guide/explore#trace-a-symbol-with-why).

| Option              | Default               | Description                        |
| ------------------- | --------------------- | ---------------------------------- |
| `--format <format>` | `text`                | `text` or `json`                   |
| `--config <file>`   | `layerscope.config.*` | Config file                        |
| `--prepare`         |                       | Run `nuxi prepare` first           |
| `--source <source>` | `auto`                | Symbol source                      |
| `--verbose`         |                       | Print where symbols were read from |

## `layerscope graph`

```bash
layerscope graph [root] [options]
```

Dependencies between layers or between files inside layers; packages are left out. Edges that
break the layer rules are red, and an edge carrying several references is labelled with the count.

| Option              | Default   | Description                                                  |
| ------------------- | --------- | ------------------------------------------------------------ |
| `--format <format>` | `mermaid` | `mermaid`, `dot` or `json`                                   |
| `--by <level>`      | `layer`   | `layer`, or `file` for files grouped in a subgraph per layer |

Also takes `--config`, `--prepare`, `--source` and `--verbose`. Exits `0`.

```bash
layerscope graph > layers.mmd
layerscope graph --by file --format dot | dot -Tsvg > files.svg
```

## `layerscope unused`

```bash
layerscope unused [root] [options]
```

Components and auto-imports (app, server and shared) registered by the project's own layers that
nothing references. An explicit import of a file counts as using all of its exports. If any file
renders a component chosen at runtime, unused components are marked "possibly used at runtime".

| Option              | Default | Description      |
| ------------------- | ------- | ---------------- |
| `--format <format>` | `text`  | `text` or `json` |

Also takes `--config`, `--prepare`, `--source` and `--verbose`. Exits `0`.

## `--source`

| Value      | Behavior                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------- |
| `auto`     | The [module's registry](../guide/nuxt-module) when it exists, otherwise the generated `.d.ts` files |
| `registry` | The registry; exit `2` when it is missing or from an incompatible version                           |
| `types`    | The generated `.d.ts` files, even when a registry exists                                            |

## Exit codes

Every command works with flags only and never prompts, so it is safe in scripts, CI and for
[coding assistants](../guide/coding-tools).

| Code | Meaning                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| `0`  | No errors (warnings do not fail), a baseline was written, `why` found the symbol, or `init`/`drift`/`fix`/`graph`/`unused` ran |
| `1`  | `check` found at least one error that is not in the baseline                                                                   |
| `2`  | Config or input problem: invalid config, unknown layer, missing or stale generated files, `why` found no use                   |

## Output streams

The report goes to stdout. Everything else goes to stderr, prefixed with `layerscope:`: errors,
notes (such as a rule that could not run or a `nuxt.config` newer than the registry) and the
`--verbose` line. Notes are printed after the report, so they are the last thing on screen.
Redirecting stdout always gives a clean report:

```bash
layerscope check --format json > report.json
```
