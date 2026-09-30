#!/usr/bin/env bash
# Writes the drift report to the job summary, and to the pull request when INPUT_COMMENT is true.
set -euo pipefail

if [ -n "${GITHUB_BASE_REF:-}" ]; then
  git fetch --depth=1 origin "$GITHUB_BASE_REF"
  base="origin/$GITHUB_BASE_REF"
else
  base="HEAD^"
fi

args=(drift "$INPUT_ROOT" --format markdown --base "$base" --baseline "$INPUT_BASELINE")
if [ -n "$INPUT_CONFIG" ]; then args+=(--config "$INPUT_CONFIG"); fi
if [ "$INPUT_PREPARE" = "true" ]; then args+=(--prepare); fi

report="$(mktemp)"
"$(dirname "$0")/layerscope.sh" "${args[@]}" > "$report"
cat "$report" >> "$GITHUB_STEP_SUMMARY"
if [ "$INPUT_COMMENT" = "true" ] && [ -n "${PR_NUMBER:-}" ]; then
  gh pr comment "$PR_NUMBER" --body-file "$report" --edit-last --create-if-none
fi
