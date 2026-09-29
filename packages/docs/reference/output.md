# Output formats

Choose a format with `--format`. Paths are relative to the current directory.

## `text`

The default. Findings grouped by file, with where each symbol resolves to:

```text
layers/admin/app/components/AdminPanel.vue
  2:14    error  Auto-import "useCart" crosses from layer "admin" into "web"  layer-boundary
                 useCart → layers/web/app/composables/useCart.ts
                 allowed for "admin": shared, auth

layers/web/app/composables/useCart.ts
  2:3     warn   "trackEvent" is not a local binding, a known global or an auto-import in the app context  unresolved-reference

✖ 2 problems (1 error, 1 warning)
```

Without findings: `✔ No problems in 20 files across 6 layers`. With a baseline the summary adds
how many findings it accepted, and fixed entries are listed before it.

## `github`

[Workflow commands](https://docs.github.com/actions/reference/workflow-commands-for-github-actions)
that GitHub shows inline on the pull request diff: `::error` for errors, `::warning` for
warnings, and `::notice` for fixed baseline entries.

```text
::error file=layers/admin/app/components/AdminPanel.vue,line=2,col=14,title=layerscope layer-boundary::Auto-import "useCart" crosses from layer "admin" into "web"%0AuseCart → layers/web/app/composables/useCart.ts%0Aallowed for "admin": shared, auth
```

Run it from the repository root so the paths match the diff; the
[GitHub Action](./github-action) does.

## `json`

A versioned, deterministic report: the same input produces the same bytes.

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

| Field                    | Description                                                                    |
| ------------------------ | ------------------------------------------------------------------------------ |
| `rule`                   | `layer-boundary`, `unresolved-reference` or `shadowed-component`               |
| `severity`               | `error` or `warn`                                                              |
| `file`, `line`, `column` | Where the reference is; 1-based                                                |
| `symbol`                 | Identifier, component name or import specifier                                 |
| `fromLayer`              | Layer of the file                                                              |
| `toLayer`                | Layer the symbol resolves to, or `null` for packages and unresolved references |
| `target`                 | File the symbol resolves to, when known                                        |
| `allowed`                | For `layer-boundary`: the layers `fromLayer` may use                           |
| `message`                | Human-readable description                                                     |

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
`unrestricted`, `allowed` or `not-allowed`.
