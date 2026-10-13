import { statSync } from 'node:fs';
import { opendir } from 'node:fs/promises';

import { LayerscopeError } from '#src/errors.ts';

export const RERUN_HINT = 'Run "nuxi prepare" again, or pass --prepare.';

/** The fix for a dir that cannot be read, when the registry gives the dir. */
export const FIX_DIR_OR_USE_TYPES = 'Fix the dir or its access, or pass --source types.';
/** The fix for a dir that cannot be read, when the generated types give the dir. */
export const FIX_DIR = 'Fix the dir or its access.';

/**
 * The fs code of a failed read, such as `ENOENT` or `EACCES`. Another error is not about the path,
 * for example a value of the wrong type (`ERR_INVALID_ARG_TYPE`). The function throws it again as
 * it is.
 */
function fsCode(error: unknown): string {
  const { code } = error as NodeJS.ErrnoException;
  if (typeof code !== 'string' || code.startsWith('ERR_')) {
    throw error;
  }
  return code;
}

/** A path that is gone (ENOENT), or that has a file in its path (ENOTDIR). */
function isGone(code: string): boolean {
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * Whether a dir that Nuxt scanned is there, for the stale check. The function opens the dir. A
 * `stat` is not enough: a dir without read access passes `stat`, but the scan cannot read it. A
 * dir that is gone (ENOENT), or that has a file in its path (ENOTDIR), has no new files, so the
 * function returns false. Any other fs error stops the check. `contents` tells what the check
 * looks for, and `fix` tells how to correct the error. Limit: tinyglobby hides an error inside its
 * walk, for example a subdir that it cannot read. A new file below such a subdir is not found.
 */
export async function isScanDirThere(
  dir: string,
  contents: string,
  fix = FIX_DIR_OR_USE_TYPES,
): Promise<boolean> {
  try {
    const handle = await opendir(dir);
    await handle.close();
    return true;
  } catch (error) {
    const code = fsCode(error);
    if (isGone(code)) {
      return false;
    }
    throw new LayerscopeError(
      `Could not read ${dir} (${code}), so layerscope cannot check it for ${contents}. ${fix}`,
    );
  }
}

/**
 * Whether a file that the generated types refer to is there. A `stat` is enough here: a file
 * without read access is still there, so the registry is not stale. The analysis lists such a file
 * as unread. A file that is gone (ENOENT), or that has a file in its path (ENOTDIR), is not there.
 * Any other fs error stops the check, because the file can be there.
 */
export function isTargetThere(file: string): boolean {
  try {
    statSync(file);
    return true;
  } catch (error) {
    const code = fsCode(error);
    if (isGone(code)) {
      return false;
    }
    throw new LayerscopeError(
      `Generated types reference ${file}, which layerscope could not read (${code}). Fix the file or its access.`,
    );
  }
}
