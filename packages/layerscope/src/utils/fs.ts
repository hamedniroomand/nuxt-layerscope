import { readFileSync, realpathSync, statSync } from 'node:fs';

import { basename, dirname, isAbsolute, join } from 'pathe';

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function readJson(path: string): unknown {
  // User-extended tsconfigs may carry line comments.
  return JSON.parse(readFileSync(path, 'utf8').replaceAll(/^\s*\/\/.*$/gmu, ''));
}

/**
 * Symlinks resolved (pnpm links packages). A path that does not exist keeps its missing part:
 * the nearest dir that exists is resolved, so the path matches the real files when they appear.
 */
export function realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    // A module specifier is not a path: it must not become one of the current dir.
    const parent = dirname(path);
    return !isAbsolute(path) || parent === path ? path : join(realPath(parent), basename(path));
  }
}
