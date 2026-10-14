import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { findUnused } from '#src/unused/index.ts';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

/** Layer `web` has the component `Lonely`, which no file names, and the given page. */
async function unusedWith(page: string): Promise<{ possiblyUsed: boolean }[]> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-runtime-')));
  roots.push(root);
  write(root, 'layers/web/app/components/Lonely.vue', '<template><div /></template>\n');
  write(
    root,
    '.nuxt/components.d.ts',
    [
      'export const Lonely: typeof import("../layers/web/app/components/Lonely.vue")["default"]',
      // Nuxt lists its own `NuxtIsland` as a component from a package.
      'export const NuxtIsland: typeof import("nuxt/dist/app/components/nuxt-island")["default"]',
      '',
    ].join('\n'),
  );
  write(root, '.nuxt/types/imports.d.ts', 'export {}\n');
  write(root, 'layers/web/app/pages/index.vue', page);
  write(
    root,
    'layerscope.config.mjs',
    "export default { layers: { web: { path: 'layers/web' } } };\n",
  );
  const result = await analyze({ rootDir: root });
  expect(result.findings).toEqual([]);
  return findUnused(result);
}

describe('unused and components chosen at runtime (#119)', () => {
  it('does not mark a component when no file chooses one at runtime', async () => {
    const unused = await unusedWith('<template><div /></template>\n');
    expect(unused).toMatchObject([{ possiblyUsed: false }]);
  });

  it('marks it after resolveDynamicComponent with a runtime value, with no finding', async () => {
    const unused = await unusedWith(
      '<script setup lang="ts">\nimport { resolveDynamicComponent } from \'vue\';\nconst props = defineProps<{ name: string }>();\nconst view = resolveDynamicComponent(props.name);\n</script>\n<template><div>{{ view }}</div></template>\n',
    );
    expect(unused).toMatchObject([{ possiblyUsed: true }]);
  });

  it('marks it after <NuxtIsland :name>, with no finding', async () => {
    const unused = await unusedWith(
      '<script setup lang="ts">\ndefineProps<{ name: string }>();\n</script>\n<template><NuxtIsland :name="name" /></template>\n',
    );
    expect(unused).toMatchObject([{ possiblyUsed: true }]);
  });
});
