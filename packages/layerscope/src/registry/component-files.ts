import { glob } from 'tinyglobby';

/** Files in a component dir, matched the way Nuxt's components module scans it. */
export async function globComponents(
  dir: string,
  pattern: string | string[],
  ignore: string[],
): Promise<string[]> {
  const files = await glob(pattern, { cwd: dir, absolute: true, ignore });
  return files.toSorted();
}
