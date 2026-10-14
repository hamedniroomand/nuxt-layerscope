// These tests run a bash script of the action with the real CLI, so they need a Unix shell. CI runs
// on Ubuntu only.
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { join, relative, resolve } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { CONFIGS_DIR, NUXT4_ROOT } from '#test/fixtures.ts';
import { tempDir } from '#test/watch-project.ts';

const SCRIPTS = resolve(import.meta.dirname, '../../../scripts');
const BIN = fileURLToPath(new URL('../src/bin.ts', import.meta.url));

/** Runs check.sh with a `layerscope.sh` that starts the CLI of this package. */
function runCheck(env: Record<string, string>): { status: number | null; err: string } {
  const scripts = join(tempDir(), 'scripts');
  mkdirSync(scripts);
  for (const name of ['check.sh', 'root-heading.sh']) {
    copyFileSync(join(SCRIPTS, name), join(scripts, name));
  }
  writeFileSync(join(scripts, 'layerscope.sh'), '#!/usr/bin/env bash\nexec "$NODE" "$BIN" "$@"\n');
  for (const name of ['check.sh', 'layerscope.sh']) {
    chmodSync(join(scripts, name), 0o755);
  }
  const result = spawnSync(join(scripts, 'check.sh'), {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      NODE: process.execPath,
      BIN,
      INPUT_CONFIG: '',
      INPUT_PREPARE: 'false',
      INPUT_BASELINE: 'layerscope-baseline.json',
      GITHUB_STEP_SUMMARY: '/dev/null',
      RUNNER_TEMP: scripts,
      ...env,
    },
  });
  return { status: result.status, err: result.stderr };
}

describe('check.sh with a root and a config', () => {
  it('reads the config input relative to the root input', () => {
    const config = relative(NUXT4_ROOT, join(CONFIGS_DIR, 'permissive.config.ts'));
    const run = runCheck({ INPUT_ROOT: NUXT4_ROOT, INPUT_CONFIG: config });
    expect(run.err).not.toContain('Config file not found');
    expect(run.status).toBe(0);
  }, 30_000);
});
