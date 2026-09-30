#!/usr/bin/env bash
# Runs the layerscope the project installs, else the pinned version through npx.
# Usage: INPUT_ROOT=. INPUT_VERSION=latest layerscope.sh <args>
set -euo pipefail

if [ -x "$INPUT_ROOT/node_modules/.bin/layerscope" ]; then
  exec "$INPUT_ROOT/node_modules/.bin/layerscope" "$@"
elif [ -x node_modules/.bin/layerscope ]; then
  exec node_modules/.bin/layerscope "$@"
fi
exec npx --yes "nuxt-layerscope@$INPUT_VERSION" "$@"
