#!/usr/bin/env bash
# Runs the layerscope the project installs, else nuxt-layerscope@$INPUT_VERSION through npx.
# Usage: INPUT_ROOT=. INPUT_VERSION=0.7.0 layerscope.sh <args>
# The action builds each option from its inputs. When the CLI does not know --summary,
# --strict-baseline or --fail-on-growth, the CLI is older than the action, and this script adds an
# ::error hint to stderr after the output of the CLI. stdout, stderr and the exit status stay as
# the CLI made them.
set -euo pipefail

installed='::error title=layerscope::The action gave an option to the nuxt-layerscope CLI that the project installs, and that CLI does not know it. Update nuxt-layerscope. The action needs version 0.10.0 or later for strict-baseline and fail-on-growth, and 0.8.0 or later for all other runs.'
if [ -x "$INPUT_ROOT/node_modules/.bin/layerscope" ]; then
  cli=("$INPUT_ROOT/node_modules/.bin/layerscope")
  hint="$installed"
elif [ -x node_modules/.bin/layerscope ]; then
  cli=(node_modules/.bin/layerscope)
  hint="$installed"
else
  cli=(npx --yes "nuxt-layerscope@$INPUT_VERSION")
  hint="::error title=layerscope::The action gave an option to nuxt-layerscope@$INPUT_VERSION, and this version does not know it. Remove the version input of the action, or set it to 0.10.0 or later."
fi

err="$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/layerscope-stderr.XXXXXX")"
trap 'rm -f "$err"' EXIT
status=0
# stderr goes through tee, so it shows live and is also kept. stdout goes to fd 3, untouched. A
# pipeline waits for tee, and pipefail gives the status of the CLI.
{ "${cli[@]}" "$@" 2>&1 1>&3 3>&- | tee "$err" >&2; } 3>&1 || status=$?
# cac writes the option name in camelCase.
if [ "$status" -ne 0 ] && grep -qE 'Unknown option `--(summary|strictBaseline|failOnGrowth)`' "$err"; then
  echo "$hint" >&2
fi
exit "$status"
