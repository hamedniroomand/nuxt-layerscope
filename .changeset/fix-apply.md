---
'nuxt-layerscope': minor
---

`fix --apply` makes the planned moves. It uses `git mv` for a file that git tracks, and it rewrites the relative imports in the importers and in the moved file.

Before the first change, it checks the plan again. It stops, and changes nothing, when:

- the git working tree has changes or untracked files, or the root is not in a git repository;
- git does not track a file to move or edit, or a file is in a submodule;
- a file is marked assume-unchanged or skip-worktree, a target is outside the git repository or in another repository, or two moves have the same target;
- a file or a target dir has a symbolic link in its path, or a file has more than one hard link;
- a file to edit is not UTF-8 text, or is not what the plan says;
- a target path exists, or two target paths differ only in letter case;
- git would refuse a move, for example a target outside a sparse checkout.

See the CLI reference for all checks.

`--allow-dirty` skips the git checks (repository, clean tree, tracked files, submodules). If a step fails, `fix` stops and lists what is done and what is not. It then tells you to use `git status` and `git diff` to see the changes and git to undo them. `fix` needs one of `--dry-run` and `--apply`, not both. `--allow-dirty` works only with `--apply`. `fix` also counts the baseline entries that name a moved file, because they do not match after the move.
