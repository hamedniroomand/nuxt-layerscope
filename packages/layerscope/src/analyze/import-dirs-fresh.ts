import { isDynamicPattern } from 'tinyglobby';

import { LayerscopeError } from '#src/errors.ts';
import { globImportFiles } from '#src/registry/import-files.ts';
import type { RegistryImportDir } from '#src/registry/schema.ts';
import { IN_NODE_MODULES } from '#src/utils/fs.ts';

import { RERUN_HINT, isScanDirThere } from './stale-check-fs.ts';

/** Whether the dir has to be compared: a dependency is not checked, and a dir that is gone has no new files. */
async function isChecked(entry: RegistryImportDir): Promise<boolean> {
  if (IN_NODE_MODULES.test(entry.dir)) {
    return false;
  }
  // A glob that the user gave in `imports.dirs` is not a path, so it is not opened.
  return isDynamicPattern(entry.dir) || (await isScanDirThere(entry.dir, 'new auto-import files'));
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
