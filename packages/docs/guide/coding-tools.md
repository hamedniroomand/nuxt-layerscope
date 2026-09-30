---
description: How coding assistants and scripts run layerscope, read its JSON report and fix a finding without loosening the allow map.
---

# Coding assistants

layerscope is built to be driven by a script or a coding assistant as well as a person: every command
takes flags only and never prompts, output is stable, and the docs are available as plain text at
[`/llms.txt`](https://layerscope.kitdev.space/llms.txt) and
[`/llms-full.txt`](https://layerscope.kitdev.space/llms-full.txt).

## Run the check

```bash
npx layerscope check --prepare --format json
```

The report goes to stdout and everything else to stderr, so stdout is always valid JSON. The exit
code says what happened:

| Code | Meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| `0`  | No errors. Warnings do not fail.                                        |
| `1`  | At least one `error` finding that is not in the baseline.               |
| `2`  | Config or input problem. Read stderr: it names the file and what to do. |

All commands are listed in the [CLI reference](../reference/cli#exit-codes). Other commands that
help with a finding: `layerscope why <symbol>` (every use of a symbol) and
`layerscope fix --dry-run` (the file moves a suggestion needs).

## Read the JSON

The report is versioned (`"version": 1`) and described by a
[JSON Schema](https://layerscope.kitdev.space/schema/report-1.json), shipped in the package as
`nuxt-layerscope/schema/report-1.json`. The fields that matter for a fix are on each entry of
`findings`:

| Field                    | Use it to                                                          |
| ------------------------ | ------------------------------------------------------------------ |
| `rule`, `severity`       | Tell an `error` `layer-boundary` from a warning                    |
| `file`, `line`, `column` | Open the reference                                                 |
| `symbol`, `target`       | Find the symbol and the file it resolves to                        |
| `fromLayer`, `toLayer`   | See which layer depends on which                                   |
| `allowed`                | See what `fromLayer` may use                                       |
| `suggestion`             | Get a fix: `action` is `move`, `allow` or `leave`, with the impact |

Consumers should ignore fields they do not know: fields may be added without changing `version`.
The full shape is in [Output formats](../reference/output#json).

## Fix a finding

1. **Move the symbol.** When a suggestion says `move`, or the symbol is used by several layers, move
   the file to the layer it names (often `shared`). Auto-imports and components need no other
   change; update explicit imports. `layerscope fix --dry-run` lists them.
2. **Ask before changing `allow`.** Adding a layer to `allow` accepts a new dependency between
   layers. That is a design decision, so make it only when the user has said the dependency is
   intended. Never loosen `allow`, add `globals`, change `rules` or edit the baseline just to get
   a green run.
3. **Leave it** when a suggestion says `leave`: the dependency would create a cycle, and moving the
   file is not possible. Report it instead.
4. Run `layerscope check` again. A fix is done when the finding is gone and no new one appeared.

## Add it to your instructions

Copy this into `AGENTS.md`, `CLAUDE.md` or the instructions file your tools read:

```md
## Layer boundaries

This project uses layerscope to keep Nuxt layers apart.

- Run `npx layerscope check --prepare --format json`. Exit `0` is clean, `1` means violations,
  `2` means a config problem (read stderr).
- Fix a `layer-boundary` finding by moving the symbol to a layer both sides may use, as its
  `suggestion` says (`npx layerscope fix --dry-run` lists the moves).
- Do not edit `allow`, `rules`, `globals` or `layerscope-baseline.json` to silence a finding. Ask
  first: allowing a dependency is a design decision.
- Docs for tools: https://layerscope.kitdev.space/llms-full.txt
```
