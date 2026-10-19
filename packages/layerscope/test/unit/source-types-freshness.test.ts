import { utimesSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { noNuxtIgnore } from '#test/factories.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';
import { tempDir, write } from '#test/watch-project.ts';

const REGISTRY = {
  version: 1,
  generator: { name: 'test', version: '0', nuxt: '4' },
  layers: [],
  components: [],
  shadowedComponents: [],
  shadowedLayouts: [],
  shadowedMiddleware: [],
  componentDirs: [],
  importDirs: [],
  nuxtIgnore: noNuxtIgnore(),
  imports: { app: [], server: [], shared: [] },
};

/** A project with a registry, read with `--source types`. nuxt.config is `configAge` seconds old. */
function project(configAge: number): string {
  const root = tempDir();
  write(root, '.nuxt/types/imports.d.ts', 'export {}\n');
  write(root, '.nuxt/components.d.ts', '\n');
  write(root, '.nuxt/layerscope/registry.json', JSON.stringify(REGISTRY));
  write(root, 'nuxt.config.ts', 'export default {};\n');
  write(root, 'layers/a/app/pages/a.vue', '<template><div /></template>\n');
  write(root, 'layerscope.config.mjs', "export default { layers: { a: { path: 'layers/a' } } };\n");
  const now = Date.now() / 1000;
  utimesSync(join(root, '.nuxt/layerscope/registry.json'), now - 100, now - 100);
  utimesSync(join(root, 'nuxt.config.ts'), now - configAge, now - configAge);
  return root;
}

describe('analyze with --source types', () => {
  it('gives the registry file as the file that holds the recorded config', async () => {
    const result = await analyze({ rootDir: NUXT4_ROOT, source: 'types' });
    expect(result.recordedFile).toBe(join(NUXT4_ROOT, '.nuxt/layerscope/registry.json'));
  });

  it('gives the same file without --source types', async () => {
    const result = await analyze({ rootDir: NUXT4_ROOT });
    expect(result.recordedFile).toBe(join(NUXT4_ROOT, '.nuxt/layerscope/registry.json'));
  });

  it('says when nuxt.config is newer than the registry', async () => {
    const result = await analyze({ rootDir: project(10), source: 'types' });
    expect(result.notes.join('\n')).toContain('nuxt.config is newer than the layerscope registry');
  });

  it('says nothing when the registry is newer than nuxt.config', async () => {
    const result = await analyze({ rootDir: project(200), source: 'types' });
    expect(result.notes.join('\n')).not.toContain('nuxt.config is newer');
  });
});
