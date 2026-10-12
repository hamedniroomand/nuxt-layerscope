import { readFileSync } from 'node:fs';

import { join, relative } from 'pathe';
import { vi } from 'vite-plus/test';

import { CART, SHARED, ADMIN, SHOP, WEB, cartProject, write } from './fix-project.ts';
import { git } from './git-project.ts';

export const MOVED = 'layers/shared/app/composables/useCart.ts';
export const OLD = '../../../web/app/composables/useCart';
export const NEW = '../../../shared/app/composables/useCart';

/** Puts the project in git with one commit, as a user has it before `fix --apply`. */
export function commitAll(root: string): void {
  write(root, '.gitignore', '.nuxt\n');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'start');
}

/** The cart project of the plan tests, committed. */
export function repoProject(): string {
  const root = cartProject([WEB, SHARED, ADMIN, SHOP]);
  commitAll(root);
  return root;
}

export function read(root: string, path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

/** A path as the command prints it: relative to the working dir. */
export function shown(root: string, path: string): string {
  return relative(process.cwd(), join(root, path));
}

export function silence(): { stdout: () => string; stderr: () => string } {
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const text = (spy: typeof out): string => spy.mock.calls.map(call => String(call[0])).join('');
  return { stdout: () => text(out), stderr: () => text(err) };
}

export function fixArgs(root: string, ...flags: string[]): string[] {
  return ['node', 'layerscope', 'fix', root, ...flags];
}

export function applyArgs(root: string, ...flags: string[]): string[] {
  return fixArgs(root, '--apply', ...flags);
}

export { CART };
