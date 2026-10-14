import { LayerscopeError } from '#src/errors.ts';
import { globComponents } from '#src/registry/component-files.ts';
import { createNuxtIgnore } from '#src/registry/nuxt-ignore.ts';
import type { NuxtIgnore } from '#src/registry/nuxt-ignore.ts';
import type { RegistryComponentDir } from '#src/registry/schema.ts';
import { IN_NODE_MODULES } from '#src/utils/fs.ts';

import { FIX_DIR, RERUN_HINT, isScanDirThere } from './stale-check-fs.ts';

/**
 * Whether the component dir has to be compared: a dependency is not checked, and a dir that is
 * gone has no new files. A dir that cannot be read stops the check.
 */
async function isComponentDirChecked(dir: RegistryComponentDir): Promise<boolean> {
  return (
    !IN_NODE_MODULES.test(dir.path) && (await isScanDirThere(dir.path, 'new components', FIX_DIR))
  );
}

/** A new file that Nuxt ignores is not an error: the components scan of Nuxt skips it too. */
export async function assertComponentDirsFresh(
  dirs: RegistryComponentDir[],
  rules: NuxtIgnore,
): Promise<void> {
  const isNuxtIgnored = createNuxtIgnore(rules);
  for (const dir of dirs) {
    // eslint-disable-next-line no-await-in-loop -- stops at the first stale dir
    if (!(await isComponentDirChecked(dir))) {
      continue;
    }
    const recorded = new Set(dir.files);
    // eslint-disable-next-line no-await-in-loop -- stops at the first stale dir
    const added = (await globComponents(dir.path, dir.pattern, dir.ignore)).find(
      file => !recorded.has(file) && !isNuxtIgnored(file),
    );
    if (added !== undefined) {
      throw new LayerscopeError(`${added} is missing from the layerscope registry. ${RERUN_HINT}`);
    }
  }
}
