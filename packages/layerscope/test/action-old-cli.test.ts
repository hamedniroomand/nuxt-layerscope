// These tests run bash scripts with a stub CLI, so they need a Unix shell. CI runs on Ubuntu only.
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs';

import { join, resolve } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { tempDir } from '#test/watch-project.ts';

const SCRIPTS = resolve(import.meta.dirname, '../../../scripts');

const INSTALLED_HINT =
  '::error title=layerscope::The action gave an option to the nuxt-layerscope CLI that the project installs, and that CLI does not know it.';
const NPX_HINT =
  '::error title=layerscope::The action gave an option to nuxt-layerscope@0.7.0, and this version does not know it.';

// The stub CLI: it prints $STUB_OUT to stdout, $STUB_ERR to stderr, and exits with $STUB_STATUS.
const STUB = `#!/usr/bin/env bash
printf '%s' "\${STUB_OUT:-}"
printf '%s' "\${STUB_ERR:-}" >&2
exit "\${STUB_STATUS:-0}"
`;

interface Run {
  status: number | null;
  out: string;
  err: string;
}

function writeStub(file: string): void {
  writeFileSync(file, STUB);
  chmodSync(file, 0o755);
}

/** Runs the real layerscope.sh. `npx`: the stub is npx on PATH, else the CLI that the project installs. */
function runCli(env: Record<string, string>, npx = false): Run {
  const dir = tempDir();
  copyFileSync(join(SCRIPTS, 'layerscope.sh'), join(dir, 'layerscope.sh'));
  chmodSync(join(dir, 'layerscope.sh'), 0o755);
  const bin = join(dir, npx ? 'stub-bin' : 'node_modules/.bin');
  mkdirSync(bin, { recursive: true });
  writeStub(join(bin, npx ? 'npx' : 'layerscope'));
  const path = process.env.PATH ?? '';
  const result = spawnSync(join(dir, 'layerscope.sh'), ['check', '.', '--strict-baseline'], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      PATH: npx ? `${bin}:${path}` : path,
      INPUT_ROOT: '.',
      INPUT_VERSION: '0.7.0',
      RUNNER_TEMP: dir,
      ...env,
    },
  });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

describe('layerscope.sh and a CLI that is older than the action', () => {
  it('adds the hint to update the installed CLI after its error, and keeps the exit status', () => {
    const cliError = 'layerscope: Unknown option `--strictBaseline`\n';
    const run = runCli({ STUB_ERR: cliError, STUB_STATUS: '2' });
    expect(run.status).toBe(2);
    expect(run.err.startsWith(cliError)).toBe(true);
    expect(run.err).toContain(INSTALLED_HINT);
    expect(run.err).not.toContain(NPX_HINT);
  });

  it('adds the hint about the version input when the CLI runs through npx', () => {
    const run = runCli(
      { STUB_ERR: 'layerscope: Unknown option `--summary`\n', STUB_STATUS: '2' },
      true,
    );
    expect(run.status).toBe(2);
    expect(run.err).toContain(NPX_HINT);
    expect(run.err).toContain(
      'Remove the version input of the action, or set it to 0.10.0 or later.',
    );
  });

  it('keeps stdout byte for byte, which drift.sh writes to the report, and puts the hint on stderr', () => {
    const run = runCli({
      STUB_OUT: '## report\n\nno newline at the end',
      STUB_ERR: 'layerscope: Unknown option `--failOnGrowth`\n',
      STUB_STATUS: '2',
    });
    expect(run.out).toBe('## report\n\nno newline at the end');
    expect(run.err).toContain(INSTALLED_HINT);
  });

  it('adds no hint when an input value gives an unknown option, because the CLI is not old', () => {
    const err = 'layerscope: Unknown option `--oddRoot`\n';
    const run = runCli({ STUB_ERR: err, STUB_STATUS: '2' });
    expect(run).toEqual({ status: 2, out: '', err });
  });

  it('adds no hint for another error, and keeps the output and the exit status', () => {
    const run = runCli({ STUB_OUT: 'out\n', STUB_ERR: 'layerscope: boom\n', STUB_STATUS: '1' });
    expect(run).toEqual({ status: 1, out: 'out\n', err: 'layerscope: boom\n' });
  });
});
