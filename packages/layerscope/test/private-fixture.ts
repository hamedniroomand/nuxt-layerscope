import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, symlinkSync } from 'node:fs';

import { join } from 'pathe';

import { NUXT4_ROOT } from '#test/fixtures.ts';

/** Runs `nuxi prepare` in the dir, which writes the registry and the `.d.ts` files again. */
export function prepareFixture(dir: string): void {
  execFileSync('npx', ['--no-install', 'nuxi', 'prepare'], { cwd: dir, stdio: 'pipe' });
}

/**
 * A private copy of the nuxt4 fixture after `nuxi prepare`, so that no other test sees the files
 * that a test adds or deletes. The caller removes it.
 */
export function privateFixture(): string {
  const copy = mkdtempSync(join(NUXT4_ROOT, '..', 'nuxt4-private-'));
  cpSync(NUXT4_ROOT, copy, {
    recursive: true,
    filter: source => !/\/(?:node_modules|\.nuxt[^/]*)(?:\/|$)/u.test(source),
  });
  symlinkSync(join(NUXT4_ROOT, 'node_modules'), join(copy, 'node_modules'));
  prepareFixture(copy);
  return copy;
}
