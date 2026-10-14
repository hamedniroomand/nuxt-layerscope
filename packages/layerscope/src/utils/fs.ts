import { readFileSync, realpathSync, statSync } from 'node:fs';

import { basename, dirname, isAbsolute, join, normalize, resolve } from 'pathe';

/** A path that is gone (ENOENT), or that has a file in its path (ENOTDIR). */
export function isGone(code: string | undefined): boolean {
  return code === 'ENOENT' || code === 'ENOTDIR';
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Parses JSON text. User-extended tsconfigs may carry line comments, so those are removed. */
export function parseJson(text: string): unknown {
  // A leading BOM is not part of the JSON; Windows PowerShell 5.1 writes one.
  return JSON.parse(text.replace(/^\uFEFF/u, '').replaceAll(/^\s*\/\/.*$/gmu, ''));
}

export function readJson(path: string): unknown {
  return parseJson(readFileSync(path, 'utf8'));
}

/** The drive (`C:`) or the share (`//server/share`) of a normalized path; `''` on POSIX. */
function volumeOf(path: string): string {
  return /^(?:[a-z]:|\/\/[^/]+\/[^/]+)/iu.exec(path)?.[0].toLowerCase() ?? '';
}

/**
 * The native call, unless it fails or, on Windows, leaves the drive of the input: it maps a
 * `subst` drive to its real drive and a mapped drive to a UNC path. The JS call keeps the drive,
 * so the result stays on the volume that the user gave. On POSIX the first segment can change
 * (`/tmp` is `/private/tmp` on macOS), and that is wanted.
 */
function resolveLinks(path: string): string {
  let native: string;
  try {
    native = normalize(realpathSync.native(path));
  } catch {
    // It also throws for a path that does not exist; then this call throws too.
    return normalize(realpathSync(path));
  }
  const sameVolume = process.platform !== 'win32' || volumeOf(normalize(path)) === volumeOf(native);
  return sameVolume ? native : normalize(realpathSync(path));
}

/**
 * Symlinks resolved (pnpm links packages), with the real case of each name and forward slashes.
 * A path that does not exist keeps its missing part: the nearest dir that exists is resolved, so
 * the path matches the real files when they appear.
 *
 * The native call gives the real case on macOS and Windows (file systems that ignore case), and
 * `\` separators on Windows. Other code compares paths as text with `/`, so the result is
 * normalized here.
 *
 * Limit: on a `subst` or mapped drive, or through a junction to another drive, the JS call is
 * used, so the path keeps the case that was typed.
 */
export function realPath(path: string): string {
  try {
    return resolveLinks(path);
  } catch {
    // A module specifier is not a path: it must not become one of the current dir.
    const parent = dirname(path);
    return !isAbsolute(path) || parent === path ? path : join(realPath(parent), basename(path));
  }
}

/**
 * The project root as the rest of layerscope compares it: absolute, with the real case. A root
 * that the user typed (`--root ./Shop`, `cwd`) can differ in case from the dir on disk, and layer
 * roots and files have the case of the disk, so a root must pass here before text compares.
 */
export function projectRoot(root?: string): string {
  return realPath(resolve(root ?? process.cwd()));
}

/** The current dir, with the real case, to make report paths relative. */
export function currentDir(): string {
  return realPath(process.cwd());
}

/** A dependency is not checked: `node_modules` as a whole segment, also at the end of the path. */
export const IN_NODE_MODULES = /(?:^|\/)node_modules(?:\/|$)/u;

/** The root with one trailing slash; the root `/` or `C:/` already has it. */
export function rootPrefix(rootDir: string): string {
  return rootDir.endsWith('/') ? rootDir : `${rootDir}/`;
}

/** A dir that is not the project root and not inside it. Both paths are real paths. */
export function isOutsideDir(dir: string, rootDir: string): boolean {
  return dir !== rootDir && !dir.startsWith(rootPrefix(rootDir));
}
