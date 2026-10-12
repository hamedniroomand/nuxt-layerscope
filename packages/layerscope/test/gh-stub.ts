/**
 * A stub gh. It records each call (and GH_REPO and GH_HOST), and the body file of a comment.
 * `api graphql` prints the file STUB_GRAPHQL, and runs the --jq filter on each page as the real gh
 * does, with the jq of the system (the stub jq is first on PATH, so the stub gh removes it); it fails when STUB_GRAPHQL_FAILS is set. `api --method PATCH` exits with STUB_PATCH_STATUS,
 * and `pr comment` with STUB_CREATE_STATUS. Like the real gh, `pr` needs a git repository in the
 * current folder when GH_REPO is not set, and `api graphql` does not.
 */
export const GH_STUB = `#!/usr/bin/env bash
if [ "$1" = pr ] && [ -z "\${GH_REPO:-}" ] && ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo 'fatal: not a git repository (stub gh)' >&2
  exit 1
fi
echo "gh $* [GH_REPO=\${GH_REPO:-} GH_HOST=\${GH_HOST:-}]" >> "CALLS_FILE"
prev=''
filter=''
for arg in "$@"; do
  case "$arg" in body=@*) cat "\${arg#body=@}" >> "CALLS_FILE" ;; esac
  if [ "$prev" = "--body-file" ]; then cat "$arg" >> "CALLS_FILE"; fi
  if [ "$prev" = "--jq" ]; then filter="$arg"; fi
  prev="$arg"
done
if [ "$1 $2" = "api graphql" ]; then
  if [ -n "\${STUB_GRAPHQL_FAILS:-}" ]; then echo 'gh: HTTP 502 (stub)' >&2; exit 1; fi
  if [ -n "$filter" ]; then PATH="\${PATH#BIN_DIR:}" jq -r "$filter" "\${STUB_GRAPHQL:-/dev/null}"; else cat "\${STUB_GRAPHQL:-/dev/null}"; fi
fi
if [ "$2" = "--method" ]; then exit "\${STUB_PATCH_STATUS:-0}"; fi
if [ "$1 $2" = "pr comment" ]; then exit "\${STUB_CREATE_STATUS:-0}"; fi
`;
