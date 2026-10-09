---
description: How long layerscope takes on a large layered project, for a one-shot run and for a long-running process, with the method and a command to measure your own project.
---

# Performance

`layerscope check` reads every source file of every layer, so its time grows with the number of
files. This page has the numbers for a project of 3,000 source files in ten layers, the method, and
a command to measure your own project.

## Cold and cached

layerscope has no cache on disk. That has one consequence for what the numbers mean:

- A one-shot `layerscope check` is **always cold**. It starts a process, reads the generated Nuxt
  files, and analyzes every file. Running it twice does the same work twice.
- **Cached** only exists in a process that stays alive: [`check --watch`](./editor#watch-mode), the
  [MCP server](./coding-tools#mcp-server), the [DevTools tab](./devtools) and the
  [ESLint plugin](./editor). They keep the result of each file in memory and analyze only the files
  that changed. Adding or deleting a file analyzes all files again, because it can change what an
  import resolves to.

A run also needs the files that Nuxt generates in `.nuxt`. `nuxi prepare` makes them, and
`--prepare` runs it for you, which adds its time.

## Numbers

Project: 3,000 source files in 10 layers (40% components, 25% composables, 15% utils, 20% server
utils and API routes), each file using two to six symbols, 71 findings. Median of seven runs (three
for the run with `nuxi prepare`). The one-shot run without `nuxi prepare` has one run first that is
not counted. The in-process rows have no such run: the first analysis is a row of its own.

- layerscope 0.3.1, Node 24.18.0
- macOS (arm64), Apple M1 Pro, 8 cores, 16 GB RAM

| Scenario                                                         | Time (median) |            Range | Peak memory |
| ---------------------------------------------------------------- | ------------: | ---------------: | ----------: |
| One-shot `check`, `.nuxt` ready (a fresh process)                |        770 ms | 742 ms to 910 ms |      205 MB |
| One-shot `check --prepare`, no `.nuxt` (includes `nuxi prepare`) |         2.7 s |   2.6 s to 4.1 s |      215 MB |
| In one process: first analysis                                   |        704 ms | 684 ms to 815 ms |      243 MB |
| In one process: again, nothing changed (cached)                  |         59 ms |   57 ms to 61 ms |      266 MB |
| In one process: after one file changed (cached)                  |         51 ms |   50 ms to 95 ms |      275 MB |
| In one process: after one file was added                         |        472 ms | 455 ms to 514 ms |      311 MB |

These are the numbers of one machine. Yours will differ; run the benchmark to see them.

- The one-shot time is the wall time of the whole process, Node start included.
- Peak memory is the maximum resident size of the layerscope process. In the run with
  `--prepare`, the `nuxi prepare` child process is not included.
- The in-process rows use the analyzer that watch mode, the MCP server and the DevTools tab share.
  Time is the analysis call; memory is the size of the process after the step.
- With the generated project, each run checks that layerscope reports the number of findings that
  the project holds, so a broken run cannot pass as a fast one. In the in-process rows, every step
  is checked, and the step after the file was added must count one file more. With `--project`, no
  number of findings is known, so nothing is checked.

## What takes the time

Most of a one-shot run is scanning and parsing the files. A cached run skips that for every file
that did not change; what is left is looking at each file's size and time, and applying the rules
to the edges. `nuxi prepare` is slower than the check itself, so in CI run it once and call
`layerscope check` without `--prepare`:

```bash
npx nuxi prepare
npx layerscope check
```

## Measure your own project

From a clone of the repository:

```bash
vp install
vp run nuxt-layerscope#build
pnpm --filter nuxt-layerscope bench --files 3000
```

The script generates the project in `packages/layerscope/bench/.project` (git-ignored), runs
`nuxi prepare` on it, and prints a table like the one above with the machine, Node and layerscope
version. The generator is seeded, so the same size gives the same project.

| Option            | Description                                                                       |
| ----------------- | --------------------------------------------------------------------------------- |
| `--files <n>`     | Source files in the generated project. Default `3000`.                            |
| `--runs <n>`      | Samples for each scenario. Default `7`, and at most `3` for the run with prepare. |
| `--only <list>`   | Scenarios to run: `A` one-shot, `B` with `nuxi prepare`, `C` in one process.      |
| `--project <dir>` | Measure a project you prepared yourself (`nuxi prepare` done). Skips `B` and `C`. |
| `--no-generate`   | Use the project that is already generated.                                        |
| `--json <file>`   | Write every sample to a file.                                                     |

A run on GitHub Actions is in the [Benchmark workflow](https://github.com/hamedniroomand/nuxt-layerscope/actions/workflows/bench.yml).
It uses a small project and only reports; it does not fail on a slow run, because shared runners
are too noisy for a limit.
