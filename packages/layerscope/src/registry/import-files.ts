import { glob } from 'tinyglobby';

/**
 * The files that the globs of an auto-import dir match, before any ignore rule of Nuxt. The
 * options are the ones that unimport uses to scan a dir, so the module and the freshness check see
 * the same files. The module records the result, and the check makes it again.
 */
export async function globImportFiles(globs: string[]): Promise<string[]> {
  const files = await glob(globs, {
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: true,
    expandDirectories: false,
  });
  return files.toSorted();
}
