import { spawnSync } from 'node:child_process';

import { LayerscopeError } from '#src/errors.ts';

export function prepareNuxt(rootDir: string): void {
  const result = spawnSync('npx', ['--no-install', 'nuxi', 'prepare'], {
    cwd: rootDir,
    // Send nuxi output to stderr so stdout stays machine-readable.
    stdio: ['ignore', 2, 2],
  });
  if (result.status !== 0) {
    throw new LayerscopeError(`"nuxi prepare" failed in ${rootDir}`);
  }
}
