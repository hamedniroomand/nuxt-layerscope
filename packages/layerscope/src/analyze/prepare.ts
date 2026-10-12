import { spawnSync } from 'node:child_process';
import type { SpawnSyncOptions } from 'node:child_process';

import { LayerscopeError } from '#src/errors.ts';
import { cleanGitEnv } from '#src/utils/git.ts';

const PREPARE_ARGS = ['--no-install', 'nuxi', 'prepare'];

export function prepareNuxt(rootDir: string): void {
  const options: SpawnSyncOptions = {
    cwd: rootDir,
    // Node prints a WASI ExperimentalWarning when oxc-parser uses its wasm fallback, and Nuxt
    // labels it as an error. No other warning from this child is useful to a user of the check.
    env: { ...cleanGitEnv(), NODE_NO_WARNINGS: '1' },
    // Send nuxi output to stderr so stdout stays machine-readable.
    stdio: ['ignore', 2, 2],
  };
  // On Windows `npx` is `npx.cmd`, which Node can start only through a shell. Node warns
  // (DEP0190) about an args array with a shell, so the command is one fixed string there.
  const result =
    process.platform === 'win32'
      ? spawnSync(`npx ${PREPARE_ARGS.join(' ')}`, { ...options, shell: true })
      : spawnSync('npx', PREPARE_ARGS, options);
  if (result.error !== undefined) {
    throw new LayerscopeError(`Could not start "npx" in ${rootDir}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new LayerscopeError(`"nuxi prepare" failed in ${rootDir}`);
  }
}
