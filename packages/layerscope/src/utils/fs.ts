import { readFileSync, realpathSync, statSync } from 'node:fs';

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

/** Symlinks resolved (pnpm links packages), or the path itself when it does not exist. */
export function realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
