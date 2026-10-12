import { lstatSync } from 'node:fs';

import { dirname } from 'pathe';

/** Whether something is at the path. A link that points nowhere is something. */
export function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

export function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** The dir of the path that exists: the dir itself, or the nearest one above it. */
export function existingDir(path: string): string {
  let dir = dirname(path);
  while (!exists(dir) && dirname(dir) !== dir) {
    dir = dirname(dir);
  }
  return dir;
}
