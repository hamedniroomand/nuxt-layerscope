#!/usr/bin/env bash
# Builds the drift report: it writes the report to the job summary, and the text of the pull request
# comment to a folder for comment.sh. This script never calls gh, and the action does not give its
# token to this step. A token that the workflow sets in its env still reaches the CLI. The folder
# has `text.md` (the comment without its marker), `label` (the root) and `state` (`report`, `failed`
# or `skipped`). The output `dir` is its path.
# A pull request compares with the tip of its base branch (GITHUB_BASE_REF). A push or a merge group
# compares with BASE_SHA, the commit before the push or the base of the merge group. BASE_SHA is
# empty for an event without a base.
set -euo pipefail

# shellcheck source=root-heading.sh
source "$(dirname "$0")/root-heading.sh"

dir="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/layerscope-drift.XXXXXX")"
echo "dir=$dir" >> "${GITHUB_OUTPUT:-/dev/null}"
printf skipped > "$dir/state"

# Prints a notice. The message is escaped as the workflow commands of GitHub need.
skip() {
  local message="$1"
  message="${message//%/%25}"
  message="${message//$'\r'/%0D}"
  message="${message//$'\n'/%0A}"
  echo "::notice title=layerscope drift::$message"
  exit 0
}

# The CLI runs git in the root, so the script does the same. The root can be a subdirectory of the
# workspace, for example with actions/checkout and `path`.
git() { command git -C "$INPUT_ROOT" "$@"; }
# Only stdout is hidden: a git error, for example "dubious ownership", must show in the log.
if ! git rev-parse --git-dir > /dev/null; then
  skip "Drift report skipped. Cannot run git in \"$INPUT_ROOT\". See the git error above."
fi

# A full clone must stay full, and a shallow clone must not get shallower: only a shallow clone
# fetches with --depth, and only when it does not have the base commit.
depth=()
if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then depth=(--depth=1); fi

# Makes sure the clone has the commit $1. Skips the report when it cannot fetch the commit.
need_commit() {
  if ! git cat-file -e "$1^{commit}" 2> /dev/null; then
    # The git error stays visible, so an authentication or network problem shows in the log.
    if ! git fetch --no-tags ${depth[@]+"${depth[@]}"} origin "$1"; then
      skip "Drift report skipped. Cannot fetch the base commit ${1:0:7}. See the git error above."
    fi
  fi
}

if [ -n "${GITHUB_BASE_REF:-}" ]; then
  # The current tip of the base branch. ls-remote also matches the end of other ref names, such as
  # refs/heads/decoy/refs/heads/main, so keep only the exact ref.
  ref="refs/heads/$GITHUB_BASE_REF"
  # A failed ls-remote (network, authentication) is not a missing branch. The git error stays visible.
  if ! lines="$(git ls-remote origin "$ref")"; then
    skip 'Drift report skipped. Cannot read the branches of origin. See the git error above.'
  fi
  tip="$(awk -v ref="$ref" '$2 == ref { print $1 }' <<< "$lines")"
  if [ -z "$tip" ]; then
    skip "Drift report skipped. Cannot find the base branch \"$GITHUB_BASE_REF\" on origin."
  fi
  need_commit "$tip"
  git update-ref "refs/remotes/origin/$GITHUB_BASE_REF" "$tip"
  base="origin/$GITHUB_BASE_REF"
else
  base="${BASE_SHA:-}"
  case "$base" in
    '' | 0000000000000000000000000000000000000000) skip 'Drift report skipped. This event has no base commit.' ;;
  esac
  need_commit "$base"
fi

args=(drift "$INPUT_ROOT" --format markdown --base "$base")
if [ -n "$INPUT_BASELINE" ]; then args+=(--baseline "$INPUT_BASELINE"); fi
if [ -n "$INPUT_CONFIG" ]; then args+=(--config "$INPUT_CONFIG"); fi
if [ "$INPUT_PREPARE" = "true" ]; then args+=(--prepare); fi

# The root as the reader sees it, and the heading of the comment.
label="$(root_label)"
printf '%s' "$label" > "$dir/label"
heading="$(root_heading layerscope)"

report="$(mktemp)"
status=0
"$(dirname "$0")/layerscope.sh" "${args[@]}" > "$report" || status=$?

if [ "$status" -ne 0 ]; then
  # The comment must not keep the numbers of an older run.
  printf '%s\n\nThe drift report failed. See the log of this job: %s/%s/actions/runs/%s.\n' \
    "$heading" "${GITHUB_SERVER_URL:-https://github.com}" "$GITHUB_REPOSITORY" "${GITHUB_RUN_ID:-}" > "$dir/text.md"
  printf failed > "$dir/state"
  exit "$status"
fi

# The report starts with the line "### layerscope". Put the root in it.
{
  printf '%s\n' "$heading"
  tail -n +2 "$report"
} > "$dir/text.md"
cat "$dir/text.md" >> "$GITHUB_STEP_SUMMARY"
printf report > "$dir/state"
