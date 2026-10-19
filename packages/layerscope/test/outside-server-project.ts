import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';

import { loadNuxtKit } from '#src/nuxt/kit.ts';
import { layersForModule } from '#src/nuxt/layers.ts';
import type { Registry } from '#src/registry/schema.ts';
import { REGISTRY_VERSION } from '#src/registry/schema.ts';

import { noNuxtIgnore } from './factories.ts';
import { NUXT4_ROOT } from './fixtures.ts';

export interface OutsideServerProject {
  /** The project root. */
  root: string;
  /** The `serverDir`, a sibling of the root. */
  api: string;
  /** The files, as absolute paths. */
  files: {
    /** In `../api`: imports a file of the `shop` layer, which is a violation. */
    violation: string;
    /** In `../api`: exports `srvUsed`, which a file of the `shop` layer imports. */
    helper: string;
    /** In `../api`: exports `srvUnused`, which nothing uses. */
    unusedHelper: string;
    /** In the `shop` layer: imports a file in `../api`. */
    shopImport: string;
  };
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/**
 * A Nuxt 4 project with the layer `shop`, whose `serverDir` is `../api`, outside the project
 * root. It has the Nuxt of the nuxt4 fixture and stub generated types, but no registry.
 */
export function createOutsideServerProject(): OutsideServerProject {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-outside-')));
  const root = join(base, 'proj');
  const api = join(base, 'api');
  mkdirSync(join(root, 'node_modules'), { recursive: true });
  for (const name of ['nuxt', 'vue']) {
    symlinkSync(
      realpathSync(join(NUXT4_ROOT, 'node_modules', name)),
      join(root, 'node_modules', name),
    );
  }
  write(
    join(root, 'nuxt.config.ts'),
    "export default { srcDir: 'app', serverDir: '../api', extends: ['./layers/shop'] };\n",
  );
  // Both layers may use nothing of the other, so each cross-layer import is a finding.
  write(
    join(root, 'layerscope.config.mjs'),
    'export default { layers: { root: { allow: [] }, shop: { allow: [] } } };\n',
  );
  write(join(root, 'layers/shop/nuxt.config.ts'), "export default { srcDir: 'app' };\n");
  write(join(root, 'layers/shop/app/utils/cart.ts'), 'export const cart = 1;\n');
  write(join(root, '.nuxt/types/imports.d.ts'), 'export {}\ndeclare global {}\n');
  write(join(root, '.nuxt/components.d.ts'), '\n');
  const violation = join(api, 'utils/x.ts');
  write(
    violation,
    "import { cart } from '../../proj/layers/shop/app/utils/cart';\nexport const x = cart;\n",
  );
  const helper = join(api, 'utils/helper.ts');
  write(helper, 'export const srvUsed = 1;\n');
  const unusedHelper = join(api, 'utils/unused.ts');
  write(unusedHelper, 'export const srvUnused = 2;\n');
  const shopImport = join(root, 'layers/shop/app/utils/uses-api.ts');
  write(
    shopImport,
    "import { srvUsed } from '../../../../../api/utils/helper';\nexport const y = srvUsed;\n",
  );
  return { root, api, files: { violation, helper, unusedHelper, shopImport } };
}

/**
 * Writes `.nuxt/layerscope/registry.json` as the Nuxt module would: the layers come from the
 * project's own loader. `server` lists the auto-imports of the server context.
 */
export async function writeOutsideRegistry(
  project: OutsideServerProject,
  server: Registry['imports']['server'],
): Promise<string> {
  const kit = await loadNuxtKit(project.root);
  const options = await kit?.loadNuxtConfig({ cwd: project.root });
  if (options === undefined) {
    throw new Error('kit expected');
  }
  const registry: Registry = {
    version: REGISTRY_VERSION,
    generator: { name: 'nuxt-layerscope', version: '0.0.0', nuxt: '4.0.0' },
    layers: await layersForModule(project.root, options),
    components: [],
    shadowedComponents: [],
    shadowedLayouts: [],
    shadowedMiddleware: [],
    componentDirs: [],
    importDirs: [],
    nuxtIgnore: noNuxtIgnore(),
    nuxtContent: false,
    imports: { app: [], server, shared: [] },
  };
  const file = join(project.root, '.nuxt/layerscope/registry.json');
  write(file, JSON.stringify(registry));
  return file;
}
