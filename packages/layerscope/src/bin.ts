#!/usr/bin/env node
import { run } from '#src/cli.ts';

process.exitCode = await run();
