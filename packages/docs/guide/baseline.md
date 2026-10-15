# Baseline

Few codebases can fix every violation before turning a check on. A baseline records the
violations you have today, so the check fails only on new ones.

## Create it

```bash
npx layerscope check --update-baseline
```

```text
✔ Wrote 42 findings to layerscope-baseline.json
```

Commit `layerscope-baseline.json`. From now on `layerscope check` reads it automatically.

## How it behaves

```bash
npx layerscope check
```

- **Findings in the baseline** are accepted: they are not printed and do not fail the check. The
  summary counts them: `✔ No problems in 120 files across 5 layers, 42 more in the baseline`.
- **New findings** are reported and fail the check as usual.
- **Fixed findings** are listed, so you can remove them:

  ```text
  layerscope-baseline.json: 2 fixed entries. Run "layerscope check --update-baseline" to remove them.
    layers/admin/app/components/AdminPanel.vue  layer-boundary useCart → shop
    layers/admin/app/utils/exportCsv.ts  layer-boundary #layers/shop/app/composables/useCart → shop
  ```

  By default, fixed entries do not fail the check. A fixed entry that stays in the file accepts the
  violation again if it comes back. With `--strict-baseline`, fixed entries fail the check, so the
  file is updated when a violation is fixed. Use it in CI.

## What counts as the same finding

An entry is identified by its **rule**, **file**, **symbol** and **target layer**, except for
`layer-cycle` (see below). The line and column are not part of it:

- Editing a file elsewhere, or moving a violation within its file, keeps it accepted.
- The same symbol used from a new file is a new finding.
- A symbol that moves to another layer (say `useCart` moves from `shop` to `checkout`) is a new
  finding, because the dependency changed.
- A file that is renamed or moved produces new findings in `check`. Regenerate the baseline in the
  same change. `drift` can follow the rename (see below).

`drift` follows a rename of a tracked file that git finds between the base and the working tree, so
a renamed file with accepted violations does not count as added and fixed. A new violation in a
renamed file still counts as added. `drift` maps the path of each finding in the file, and the path
in a relative import of a renamed file. Git finds a rename only when at least 50% of the file stays
the same, or 30% when the file keeps its name. A rename that git does not find, a copy, a rename
into or out of the root, and an alias import of a renamed file (`#layers/...`) still count as added
and fixed. A move to another layer counts as added and fixed for a finding that names a target
layer.

A `layer-cycle` entry is identified by its **rule**, **symbol** and **target layer**, but not by its
**file**. The symbol is the chain of layers, for example `auth → shop → auth`, and the target layer
is the second layer in it. The file is not part of it, because the finding is shown at the first
use in the cycle, and that file changes when you add or remove a use. The `file` in the entry
tells you where the first use was when the baseline was written. A baseline made by an
older release still matches each cycle by its chain. In one case it does not: when two cycles of the
same length go through one layer, layerscope can now show the other cycle. `check` then reports it
as new once. Run `check --update-baseline` to accept it. Since this release, layerscope always shows
the cycle whose layers sort first, so the entry then stays stable.

When the same key occurs more than once, for example a name used both as an auto-import and as
a component in one file, the entry has a `count` and that many findings are accepted.

## The file

```json [layerscope-baseline.json]
{
  "version": 1,
  "entries": [
    {
      "rule": "layer-boundary",
      "file": "layers/admin/app/components/AdminPanel.vue",
      "symbol": "useCart",
      "toLayer": "shop"
    }
  ]
}
```

Entries are sorted, and paths are relative to the project root, so the file diffs well in review.
A file outside the root has a path that starts with `../`.

## Options

| Option              | Description                                                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--baseline <file>` | Baseline path, relative to the root. Default: the `baseline` key of the config, else `layerscope-baseline.json`.                                                                                                                                                  |
| `--update-baseline` | Write every current finding (errors and warnings) and exit `0`.                                                                                                                                                                                                   |
| `--strict-baseline` | Fail when the baseline has fixed entries. With `--staged`, `--changed`, `--since` or file arguments, only the entries of the selected files count. With the `.d.ts` source, `shadowed-component` entries do not count. Not with `--watch` or `--update-baseline`. |

Set the [`baseline`](../reference/config#baseline) key in the config to use another file in
`check`, `fix`, `drift`, `mcp`, the DevTools tab and the GitHub Action. `init --baseline` always
writes `layerscope-baseline.json`.

Without a baseline file, `check` behaves as if there were none.

A baseline file that is not valid stops `check`, `fix` and `drift` with exit code `2`, and the
message names the file. When `--staged`, `--changed` or `--since` selects no file, `check` exits
`0`: with `--format json`, `sarif` or `gitlab` the error is in a note of the report, and with `text`
and `github` the file is not read. These files are not valid: an empty file, a file that is not
JSON, a directory, a file with an entry whose `count` is not a whole number above 0, a file with
another version, and a file that layerscope cannot read. An empty `--baseline` value is also
refused. A `baseline` key that is not a non-empty string is also refused. `drift` also stops for a
baseline outside the git repository, for a baseline that is a symbolic link on the base ref, and
when git cannot list the renamed files. Put the file in the repository. Commit the file itself, not a link.
For a file from a newer layerscope, update layerscope. Do not create the file again,
because that removes the newer data. For a directory, use another file name. For a file that cannot
be read, check its permissions. In other cases, fix the file, or run `--update-baseline` to write a
new one. `check --watch` prints the error, and `mcp` returns it to the assistant. Both keep running,
so you can fix the file.

In JSON output the accepted findings are listed under `baseline.suppressed` and fixed entries under
`baseline.removable`; with `--format github` fixed entries become `::notice` annotations, or
`::error` annotations with `--strict-baseline`.

## A workflow that works

1. Add layerscope with the rules you want, and run `--update-baseline` once.
2. Turn the check on in CI with `--strict-baseline` (the action input `strict-baseline: true`). New
   violations are blocked, and a fixed violation must leave the file in the same pull request.
3. Fix accepted violations when you work in those files, and run `--update-baseline` in the same
   pull request.
4. Delete the file when it is empty.
