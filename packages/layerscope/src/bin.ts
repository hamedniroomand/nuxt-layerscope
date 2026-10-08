#!/usr/bin/env node
import { hideWasiWarning } from '#src/hide-wasi-warning.ts';

// The filter must exist before oxc-parser loads, so the CLI loads after it. A static import would
// let the bundler load oxc-parser first.
hideWasiWarning();
const { run } = await import('#src/cli.ts');

process.exitCode = await run();
