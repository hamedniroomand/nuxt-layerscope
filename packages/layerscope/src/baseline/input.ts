import { readFileSync, statSync } from 'node:fs';
import type { Stats } from 'node:fs';

import { resolve } from 'pathe';

import { LayerscopeError } from '#src/errors.ts';

export const BASELINE_FILE = 'layerscope-baseline.json';

/** Bumped on breaking changes to the baseline file. */
export const BASELINE_VERSION = 1;

export function isCount(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Checks the value of `--baseline`. The option parser gives a number for an empty value, for
 * `" "` and for a value like `2024`, and a list for a flag that is given more than once. So the
 * value is a file name only when it is a non-empty string.
 */
export function assertBaselineOption(value: unknown): void {
  if (Array.isArray(value)) {
    throw new LayerscopeError('--baseline was given more than once. Give it one time.');
  }
  if (typeof value === 'string' && value !== '') {
    return;
  }
  // The parser gives 0 for `""` and `" "`, so a file name that is a number has a hint, 0 has none.
  const hint =
    typeof value === 'number' && value !== 0
      ? ' For a file name that is a number, write it as ./<name>.'
      : '';
  throw new LayerscopeError(
    `--baseline needs a file name. Leave it out to use ${BASELINE_FILE}.${hint}`,
  );
}

/** The path of the baseline file. `check` and `drift` both use it, so they read the same file. */
export function baselinePath(rootDir: string, name: string): string {
  return resolve(rootDir, name);
}

/** The check for the public API: it must not name a command line flag. */
export function assertBaselineName(name: string): void {
  if (name === '') {
    throw new LayerscopeError('baseline must be a non-empty file name.');
  }
}

function cannotRead(file: string, error: unknown): LayerscopeError {
  const { code } = error as NodeJS.ErrnoException;
  return new LayerscopeError(
    `Cannot read ${file} (${code ?? (error as Error).message}). Check the permissions of the file and of its folders.`,
  );
}

/**
 * The status of `file`, or `null` when it is not there: a missing file, or a missing folder or a
 * file in place of a folder on its path. Any other error (for example no permission) is not
 * "not there", so it stops with a message.
 */
function statFile(file: string): Stats | null {
  try {
    return statSync(file);
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return null;
    }
    throw cannotRead(file, error);
  }
}

/** Stops with a clear message when `file` is a directory: it cannot be read or written. */
export function assertNotDirectory(file: string): void {
  if (statFile(file)?.isDirectory() === true) {
    throw new LayerscopeError(`${file} is a directory, not a baseline file.`);
  }
}

/** The text of `file`, or `null` when the file is not there. */
export function readBaselineText(file: string): string | null {
  if (statFile(file) === null) {
    return null;
  }
  assertNotDirectory(file);
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    throw cannotRead(file, error);
  }
}

export const FILE_ADVICE = 'Create it again with --update-baseline.';

export function checkVersion(version: unknown, label: string, advice: string): void {
  if (version === BASELINE_VERSION) {
    return;
  }
  if (typeof version === 'number' && Number.isInteger(version) && version > BASELINE_VERSION) {
    throw new LayerscopeError(
      `${label} has baseline version ${version}, and this layerscope reads version ${BASELINE_VERSION}. Update layerscope. Do not create the file again, because that removes the newer data.`,
    );
  }
  if (typeof version === 'number' && Number.isInteger(version)) {
    throw new LayerscopeError(
      `${label} has baseline version ${version}, and this layerscope reads version ${BASELINE_VERSION}. ${advice}`,
    );
  }
  throw new LayerscopeError(`${label} is not a layerscope baseline. ${advice}`);
}

export function hasBadCount(entry: unknown): boolean {
  const { count } = (entry ?? {}) as { count?: unknown };
  return typeof entry === 'object' && count !== undefined && !isCount(count);
}
