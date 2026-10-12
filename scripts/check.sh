#!/usr/bin/env bash
# Runs `layerscope check --format github`, and adds the list of the findings to the job summary.
# GitHub shows at most 10 error and 10 warning annotations for each step, so the summary has the
# rest. The CLI writes the list to a file (--summary), and this script keeps the exit status of the
# CLI.
set -euo pipefail

# shellcheck source=root-heading.sh
source "$(dirname "$0")/root-heading.sh"

summary="$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/layerscope-summary.XXXXXX")"
trap 'rm -f "$summary"' EXIT
args=(check "$INPUT_ROOT" --format github --baseline "$INPUT_BASELINE" --summary "$summary")
if [ -n "$INPUT_CONFIG" ]; then args+=(--config "$INPUT_CONFIG"); fi
if [ "$INPUT_PREPARE" = "true" ]; then args+=(--prepare); fi

status=0
"$(dirname "$0")/layerscope.sh" "${args[@]}" || status=$?

# The file is empty when there is no finding. A failed append must not change the status.
if [ -s "$summary" ]; then
  { root_heading 'layerscope findings'; printf '\n\n'; cat "$summary"; } >> "${GITHUB_STEP_SUMMARY:-/dev/null}" || true
fi
exit "$status"
