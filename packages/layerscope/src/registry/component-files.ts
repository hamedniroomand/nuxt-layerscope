import { glob } from 'tinyglobby';

import { IN_NODE_MODULES } from '#src/utils/fs.ts';

/** Files in a component dir, matched the way Nuxt's components module scans it. */
export async function globComponents(
  dir: string,
  pattern: string | string[],
  ignore: string[],
): Promise<string[]> {
  const files = await glob(pattern, { cwd: dir, absolute: true, ignore });
  return files.toSorted();
}

/** The files that the registry records for a component dir. A dependency is not checked, so its files are not recorded. */
export async function recordedComponents(
  dir: string,
  pattern: string | string[],
  ignore: string[],
): Promise<string[]> {
  if (IN_NODE_MODULES.test(dir)) {
    return [];
  }
  const files = await globComponents(dir, pattern, ignore);
  return files;
}
