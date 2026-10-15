#!/usr/bin/env bash
# Fails the job when the drift report shows growth, or when the report could not be made, so that
# layerscope cannot show that the baseline did not grow. An event with no base commit passes.
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
  echo "::error title=layerscope drift::The drift report shows errors that the baseline at $base does not have. See the drift report in the job summary."
  exit 1
fi
if [ -n "$dir" ] && [ -f "$dir/nobase" ]; then
  echo '::notice title=layerscope drift::fail-on-growth: this event has no base commit, so there is nothing to compare.'
  exit 0
fi
if [ "$state" != report ]; then
  echo '::error title=layerscope drift::fail-on-growth is on, but the drift report could not be made, so layerscope cannot show that the baseline did not grow. See the drift step above.'
  exit 1
fi
