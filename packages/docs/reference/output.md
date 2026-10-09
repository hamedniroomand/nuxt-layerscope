# Output formats

Choose a format with `--format`. Paths are relative to the current directory, except in `sarif`
and `gitlab`, where they are relative to the repository root.

## `text`

The default. Findings grouped by file, with where each symbol resolves to:

```text
layers/web/app/composables/useCart.ts
  2:3     warn   "trackEvent" is not a local binding, a known global or an auto-import in the app context  unresolved-reference

layers/admin/app/components/AdminPanel.vue
  2:14    error  Auto-import "useCart" crosses from layer "admin" into "web"  layer-boundary
                 useCart → layers/web/app/composables/useCart.ts
                 allowed for "admin": shared, auth
                 suggestion: allow "admin" to use "web" (adds 1 edge, clears 4 findings)

✖ 2 problems (1 error, 1 warning)
```

Files with only warnings come first and files with errors last, next to the summary, so the errors
are what stays on screen when a long report scrolls. Inside a file, findings follow the source
order.

Severities, rules and the summary are colored when stdout is a terminal. `NO_COLOR` turns colors
off and `FORCE_COLOR` turns them on, for example in a CI log that renders them.

Without findings: `✔ No problems in 20 files across 6 layers`. With a baseline the summary adds
how many findings it accepted, and fixed entries are listed before it.

## `github`

[Workflow commands](https://docs.github.com/actions/reference/workflow-commands-for-github-actions)
that GitHub shows inline on the pull request diff: `::error` for errors, `::warning` for
warnings, and `::notice` for fixed baseline entries.

```text
::error file=layers/admin/app/components/AdminPanel.vue,line=2,col=14,title=layerscope layer-boundary::Auto-import "useCart" crosses from layer "admin" into "web"%0AuseCart → layers/web/app/composables/useCart.ts%0Aallowed for "admin": shared, auth%0Asuggestion: allow "admin" to use "web" (adds 1 edge%2C clears 4 findings)
```

Run it from the repository root so the paths match the diff; the
[GitHub Action](./github-action) does.

## `json`

A versioned, deterministic report: the same input produces the same bytes. It is described by a
[JSON Schema](https://layerscope.kitdev.space/schema/report-1.json), also shipped as
`nuxt-layerscope/schema/report-1.json`, and covered by tests. `version` is raised only on breaking
changes; new fields can be added without it, so ignore fields you do not know.

```json
{
  "version": 1,
  "source": "registry",
  "notes": [],
  "layers": [
    { "name": "root", "root": "." },
    { "name": "web", "root": "layers/web" },
    { "name": "admin", "root": "layers/admin" }
  ],
  "summary": { "files": 20, "errors": 1, "warnings": 0 },
  "findings": [
    {
      "rule": "layer-boundary",
      "severity": "error",
      "file": "layers/admin/app/components/AdminPanel.vue",
      "line": 2,
      "column": 14,
      "symbol": "useCart",
      "fromLayer": "admin",
      "toLayer": "web",
      "target": "layers/web/app/composables/useCart.ts",
      "allowed": ["shared", "auth"],
      "suggestion": {
        "action": "allow",
        "message": "allow \"admin\" to use \"web\" (adds 1 edge, clears 4 findings)",
        "impact": { "fixes": 4, "edges": 1 }
      },
      "message": "Auto-import \"useCart\" crosses from layer \"admin\" into \"web\""
    }
  ]
}
```

| Field      | Description                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------- |
| `version`  | Report version, `1`. Raised only on breaking changes to the shape.                              |
| `source`   | `registry` or `types`: where symbols were read from.                                            |
| `notes`    | Notes also printed on stderr, such as a rule that could not run.                                |
| `layers`   | Every layer in priority order, with its root.                                                   |
| `summary`  | Files checked, and errors and warnings reported.                                                |
| `findings` | Reported findings, sorted by file, line, column, rule and symbol.                               |
| `baseline` | Only with a baseline: `file`, `suppressed` (accepted findings) and `removable` (fixed entries). |

Finding fields:

| Field                    | Description                                                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rule`                   | `layer-boundary`, `layer-cycle`, `layer-internal`, `unresolved-reference` or `shadowed-component`                                                                                                     |
| `severity`               | `error` or `warn`                                                                                                                                                                                     |
| `file`, `line`, `column` | Where the reference is; 1-based                                                                                                                                                                       |
| `symbol`                 | Identifier, component name or import specifier                                                                                                                                                        |
| `fromLayer`              | Layer of the file                                                                                                                                                                                     |
| `toLayer`                | Layer the symbol resolves to, or `null` for packages and unresolved references                                                                                                                        |
| `target`                 | File the symbol resolves to, when known                                                                                                                                                               |
| `allowed`                | For `layer-boundary`: the layers `fromLayer` may use whole                                                                                                                                            |
| `scoped`                 | For `layer-boundary`: the layers `fromLayer` may use in part, as `{ layer, only }` entries                                                                                                            |
| `exposed`                | For `layer-internal`: what the layer of the symbol makes public, from its `expose` list                                                                                                               |
| `suggestion`             | For `layer-boundary` and `layer-internal`: `action` (`move`, `allow`, `expose`, `leave`), `message`, `impact`; `move` adds `layer` and `file`, `allow` can add `only`, `expose` adds the entry to add |
| `message`                | Human-readable description                                                                                                                                                                            |

## `sarif`

A [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html) log, which
GitHub code scanning and other dashboards read. Findings stay in the Security tab of the
repository over time and are not limited by the annotation count of a job.

```bash
layerscope check --format sarif > layerscope.sarif
```

- One `run`. `tool.driver` has the name, the version and one entry in `rules` for each rule, with
  a short description, the severity the rule has in your config as `defaultConfiguration.level`
  (`none` when the rule is `off`) and `helpUri`, a link to the [rule](./rules).
- Each finding is a `result` with `ruleId`, `ruleIndex`, `level` (`error` or `warning`),
  `message` and a location with a 1-based line and column. A finding with a target, such as the
  file a `layer-boundary` finding resolves to, has it as a related location.
- The location URI is relative to the repository root, the git root of the project, with
  `uriBaseId` set to `%SRCROOT%`. Without git it is relative to the project root.
- `partialFingerprints` has `layerscope/v1`, a sha256 hash of the [baseline](../guide/baseline)
  key: rule, file, symbol and target layer, without the line. Code scanning uses it to match the
  same finding across runs, so a finding that moves down a file stays the same alert. Findings
  with the same key in one file get an occurrence number, counted in report order.
- Findings that the baseline accepts are included with
  `suppressions: [{ "kind": "external", "justification": "layerscope baseline" }]`, so code
  scanning shows them as suppressed and not as fixed.

## `gitlab`

A [GitLab Code Quality](https://docs.gitlab.com/ci/testing/code_quality/) report: a JSON array
that GitLab shows in the merge request widget and in the diff.

```bash
layerscope check --format gitlab > gl-code-quality-report.json
```

```json
[
  {
    "description": "Auto-import \"useCart\" crosses from layer \"admin\" into \"web\"",
    "check_name": "layer-boundary",
    "fingerprint": "9f2c…",
    "severity": "major",
    "location": { "path": "layers/admin/app/components/AdminPanel.vue", "lines": { "begin": 2 } }
  }
]
```

- `severity` is `major` for an error and `minor` for a warning.
- `location.path` is relative to the repository root, the git root of the project, which GitLab
  needs when the Nuxt project is in a subdirectory. Without git it is relative to the project
  root.
- `fingerprint` is the same value as `partialFingerprints` in `sarif`.
- Unlike `sarif`, the report leaves out findings that the baseline accepts: Code Quality has no
  suppression state.

## `why` output

`layerscope why` supports `text` and `json`. The JSON report has the same `version`:

```json
{
  "version": 1,
  "symbol": "useCart",
  "targets": [
    {
      "symbol": "useCart",
      "file": "layers/web/app/composables/useCart.ts",
      "layer": "web",
      "external": null,
      "uses": [
        {
          "file": "layers/admin/app/components/AdminPanel.vue",
          "line": 2,
          "column": 14,
          "kind": "auto-import",
          "symbol": "useCart",
          "fromLayer": "admin",
          "toLayer": "web",
          "status": "not-allowed"
        }
      ]
    }
  ]
}
```

`kind` is `auto-import`, `component` or `import`; `status` is `same-layer`, `external`,
`unrestricted`, `allowed`, `not-allowed` or `not-exposed`. Each target also has `exposure`: `exposed`
or `internal` when its layer sets [`expose`](./config#expose), and `all` when it does not.
