---
description: Record the Nuxt layer violations you have today in a baseline, so layerscope fails CI only on new cross-layer imports.
---

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

  The command in the hint has the same root and options as your run, for example
  `layerscope check apps/web --config site.ts --update-baseline`.

  By default, fixed entries do not fail the check. A fixed entry that stays in the file accepts the
  violation again if it comes back. With `--strict-baseline`, fixed entries fail the check, so the
  file is updated when a violation is fixed. Use it in CI.

## Stop the baseline from growing

A pull request can add a violation and run `--update-baseline` in the same change. Then `check`
passes. `drift --fail-on-growth` (the action input `fail-on-growth: true`) fails when the code has
errors that the baseline at the base commit does not have (the latest commit of the base branch on
a pull request, the commit before the push on a push, the base of the merge group in a merge queue),
so such a pull request fails. It counts
the added errors, not the size of the file, so a change that fixes one violation and accepts another
also fails. A base without the baseline file counts as an empty baseline, so turn the option on
after the file is in the base commit. A growth that you want, for example after a stricter config or
a newer layerscope, also fails: add the label `layerscope: accept growth` to the pull request (see
[GitHub Action](../reference/github-action#drift-summary)), or merge it without this check. After
such a merge, the push run on the base branch fails once, because it compares with the commit before
the merge. To check only pull requests, use
<code v-pre>fail-on-growth: ${{ github.event_name == 'pull_request' }}</code>. `drift` reads the
rules of the current config on both sides, so a change that sets a rule to `warn` or `off` shows no
growth. Use it with `--strict-baseline`, which fails an entry that no finding matches.

## What counts as the same finding

An entry is identified by its **rule**, **file**, **symbol** and **target layer**, except for
`layer-cycle` (see below). The line and column are not part of it:

- Editing a file elsewhere, or moving a violation within its file, keeps it accepted.
- The same symbol used from a new file is a new finding.
- A symbol that moves to another layer (say `useCart` moves from `shop` to `checkout`) is a new
  finding, because the dependency changed.
- A file that is renamed or moved produces new findings in `check`. Regenerate the baseline in the
  same change. `drift` can follow the rename (see below).

`drift` follows a rename that git finds between the base and the working tree, so a renamed file
with accepted violations does not count as added and fixed. Git must track the new path: use
`git mv`, or `git add` after a move. A new violation in a renamed file still counts as added.
`drift` maps the path of each finding in the file. It also maps the path in a relative import in a
renamed file, and in a relative import of a renamed file. This includes an import through a symbolic
link when only the file with the import moved. `drift` follows a rename only when git finds at least
50% of the file the same, or 30% when the file moves to the same place in another layer, as `fix`
moves it. So an unrelated file at the same place in another layer can take the accepted entries of a
deleted file that name no target layer, such as `unresolved-reference` entries. These cases still
count as added and fixed: a rename that git does not find, a copy, and a rename into or out of the
root. An alias import of a renamed file (`#layers/...`) also counts. So does a relative import
through a symbolic link when the link or the target of the link moved. A move to another layer
counts as added and fixed for a finding that names a target layer. When many files in the root were
added and deleted, git can skip its check for renames with edits, because of its rename limit
(`diff.renameLimit`). Then `drift` prints a note on stderr. The note names the limit that git
advises. A file that moved with edits then counts as added and fixed. A file that moved with no
edits is still found.

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

| Option              | Description                                                                                                                                                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--baseline <file>` | Baseline path, relative to the root. Default: the `baseline` key of the config, else `layerscope-baseline.json`.                                                                                                                                                       |
| `--update-baseline` | Write every current finding (errors and warnings) and exit `0`.                                                                                                                                                                                                        |
| `--strict-baseline` | Fail when the baseline has fixed entries. With `--staged`, `--changed`, `--since` or file arguments, only the entries of the selected files count. With the `.d.ts` source, entries of the `shadowed-*` rules do not count. Not with `--watch` or `--update-baseline`. |

Set the [`baseline`](../reference/config#baseline) key in the config to use another file in `check`,
`fix`, `drift`, `mcp`, the DevTools tab and the GitHub Action. `init --baseline` writes the file
that the `baseline` key of the config names. Without the key, it writes `layerscope-baseline.json`.
`check --update-baseline`, `init --baseline` and the DevTools tab make the folder of the file when
it does not exist. When a command cannot make the folder or write the file, it exits `2` and the
message names the file and the error code.

Without a baseline file, `check` behaves as if there were none.

A baseline file that is not valid stops `check`, `fix` and `drift` with exit code `2`, and the
message names the file. When `--staged`, `--changed`, `--since` or file arguments select no source
file, `check` still reads the baseline, and exits `2` for a file that is not valid. These files are
not valid: an empty file, a file that is not
JSON, a directory, a file with an entry whose `count` is not a whole number above 0, a file with
another version, and a file that layerscope cannot read. An empty `--baseline` value is also
refused. A `baseline` key that is not a non-empty string is also refused. `drift` also stops for a
baseline outside the git repository, for a baseline that is a symbolic link on the base ref, and
when git cannot list the renamed files. Put the file in the repository. Commit the file itself, not
a link. For a git error, fix it or use another ref with `--base`.
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
   violations are blocked, and `fail-on-growth: true` fails a pull request that accepts them. Turn
   it on after the baseline file is in the base commit. A fixed violation must leave the file in the
   same pull request.
3. Fix accepted violations when you work in those files, and run `--update-baseline` in the same
   pull request.
4. Delete the file when it is empty.
