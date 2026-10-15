#!/usr/bin/env bash
# Fails the job when the drift report shows growth. It also fails when the report could not be
# made, because then nothing shows that the baseline did not grow. An event with no base commit
# passes. ACCEPT_GROWTH is `true` for a pull request with the label "layerscope: accept growth": the
# label accepts growth, not a missing report.
# REPORT_DIR is the folder of drift.sh. This step runs after the comment step, so the comment is
# posted first.
set -euo pipefail

dir="${REPORT_DIR:-}"
state=failed
if [ -n "$dir" ] && [ -f "$dir/state" ]; then state="$(cat "$dir/state")"; fi

if [ -n "$dir" ] && [ -f "$dir/grew" ]; then
  base="$(cat "$dir/grew")"
  base="${base//%/%25}"
  base="${base//$'\r'/%0D}"
  base="${base//$'\n'/%0A}"
  if [ "${ACCEPT_GROWTH:-}" = true ]; then
    echo "::notice title=layerscope drift::The drift report shows errors that the baseline at $base does not have. The pull request has the label \"layerscope: accept growth\", so this step passes."
    exit 0
  fi
  echo "::error title=layerscope drift::The drift report shows errors that the baseline at $base does not have. See the drift report in the job summary."
  exit 1
fi
if [ -n "$dir" ] && [ -f "$dir/nobase" ]; then
  echo '::notice title=layerscope drift::fail-on-growth: this event has no base commit, so there is nothing to compare.'
  exit 0
fi
if [ "$state" != report ]; then
  echo '::error title=layerscope drift::fail-on-growth is on, but the drift report could not be made, so nothing shows that the baseline did not grow. See the drift step above.'
  exit 1
fi
