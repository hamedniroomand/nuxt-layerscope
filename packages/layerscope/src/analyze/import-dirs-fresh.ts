import { opendir } from 'node:fs/promises';

import { isDynamicPattern } from 'tinyglobby';

import { LayerscopeError } from '#src/errors.ts';
import { globImportFiles } from '#src/registry/import-files.ts';
import type { RegistryImportDir } from '#src/registry/schema.ts';

export const RERUN_HINT = 'Run "nuxi prepare" again, or pass --prepare.';

/** A dependency is not checked: `node_modules` as a whole segment, also at the end of the path. */
const IN_NODE_MODULES = /(?:^|\/)node_modules(?:\/|$)/u;

/**
 * Whether the dir of an auto-import scan is there. The dir is opened, not only `stat`-ed: a dir
 * without read access passes `stat`, but the scan cannot read it. Only a dir that is gone (or that
 * has a file in its path) is left out: it has no new files. Any other error, such as a dir without
 * access, is not an empty dir, so it stops the check. Limit: tinyglobby hides an error inside its
 * walk (a subdir that it cannot read), so a new file below such a dir is not found.
 */
async function isThere(dir: string): Promise<boolean> {
  try {
    const handle = await opendir(dir);
    await handle.close();
    return true;
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return false;
    }
    throw new LayerscopeError(
      `Could not read ${dir} (${code ?? 'unknown error'}), so layerscope cannot check it for new auto-import files. Fix the access to the dir, or pass --source types.`,
    );
  }
}

/** Whether the dir has to be compared: a dependency is not checked, and a dir that is gone has no new files. */
async function isChecked(entry: RegistryImportDir): Promise<boolean> {
  if (IN_NODE_MODULES.test(entry.dir)) {
    return false;
  }
  // A glob that the user gave in `imports.dirs` is not a path, so it is not opened.
  return isDynamicPattern(entry.dir) || (await isThere(entry.dir));
}

export async function assertImportDirsFresh(dirs: RegistryImportDir[]): Promise<void> {
  for (const entry of dirs) {
    // eslint-disable-next-line no-await-in-loop -- stops at the first stale dir
    if (!(await isChecked(entry))) {
      continue;
    }
    const recorded = new Set(entry.files);
    // eslint-disable-next-line no-await-in-loop -- stops at the first stale dir
    const added = (await globImportFiles(entry.globs)).find(file => !recorded.has(file));
    if (added !== undefined) {
      throw new LayerscopeError(`${added} is missing from the layerscope registry. ${RERUN_HINT}`);
    }
  }
}
