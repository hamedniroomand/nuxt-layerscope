import { spawnSync } from 'node:child_process';

import { LayerscopeError } from '#src/errors.ts';

export function prepareNuxt(rootDir: string): void {
  const result = spawnSync('npx', ['--no-install', 'nuxi', 'prepare'], {
    cwd: rootDir,
    // Node prints a WASI ExperimentalWarning when oxc-parser uses its wasm fallback, and Nuxt
    // labels it as an error. No other warning from this child is useful to a user of the check.
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    // Send nuxi output to stderr so stdout stays machine-readable.
    stdio: ['ignore', 2, 2],
  });
  if (result.status !== 0) {
    throw new LayerscopeError(`"nuxi prepare" failed in ${rootDir}`);
  }
}
