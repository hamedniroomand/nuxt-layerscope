import { join } from 'pathe';
import { describe, expect, it, vi } from 'vite-plus/test';

import type { ShadowedFile } from '#src/registry/schema.ts';
import { collectProject, createUnimport } from '#test/collect-project.ts';
import type { CollectProject, RealUnimport } from '#test/collect-project.ts';

const kit = vi.hoisted(() => ({ warn: vi.fn<(text: string) => void>() }));

// The recorder warns when it cannot read the import dirs. These tests do not check the text.
vi.mock('@nuxt/kit', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useLogger: (): { warn: typeof kit.warn } => ({ warn: kit.warn }),
}));

/**
 * Nitro with a root layer and a `base` layer: their `utils` dirs and `shared/utils` dirs, in the
 * order that Nitro gives them before Nuxt sorts them, so the dirs of `base` come last.
 */
async function twoLayers(
  project: CollectProject,
): Promise<{ dirs: string[]; unimport: RealUnimport }> {
  const { base } = project;
  const dirs = [
    join(base, 'shared/utils'),
    join(base, 'layers/base/shared/utils'),
    join(base, 'server/utils/**/*'),
    join(base, 'layers/base/server/utils/**/*'),
  ];
  const unimport = (await createUnimport())({ dirs });
  // Nitro scans its dirs when it starts, before `nitro:init`.
  await unimport.scanImportsFromDir();
  await project.call('nitro:init', {
    options: {
      imports: { dirs },
      scanDirs: [join(base, 'server'), join(base, 'layers/base/server')],
    },
    unimport,
  });
  return { dirs, unimport };
}

/** What Nuxt 4.6 does in its own `nitro:init` handler: the dirs of the higher layer come last. */
function sortAsNuxt(dirs: string[]): void {
  dirs.sort((a, b) => Number(b.includes('/layers/base/')) - Number(a.includes('/layers/base/')));
}

async function shadowedServerImports(project: CollectProject): Promise<ShadowedFile[]> {
  const registry = await project.collect();
  return registry.shadowedServerImports;
}

describe('the collector and the server utils that another layer overrides', () => {
  it('reports the util that Nitro does not use after Nuxt sorts the dirs', async () => {
    const project = await collectProject();
    project.write('server/utils/stamp.ts', 'export const stamp = 1;\n');
    project.write('layers/base/server/utils/stamp.ts', 'export const stamp = 2;\n');
    const { dirs } = await twoLayers(project);
    sortAsNuxt(dirs);
    expect(await shadowedServerImports(project)).toEqual([
      {
        name: 'stamp',
        file: join(project.base, 'layers/base/server/utils/stamp.ts'),
        shadowedBy: join(project.base, 'server/utils/stamp.ts'),
      },
    ]);
  });

  it('reports the util that Nitro does not use when the dirs are not sorted', async () => {
    // Before Nuxt 4.6, the later dir wins: the dir of the lower layer.
    const project = await collectProject();
    project.write('server/utils/stamp.ts', 'export const stamp = 1;\n');
    project.write('layers/base/server/utils/stamp.ts', 'export const stamp = 2;\n');
    await twoLayers(project);
    const found = await shadowedServerImports(project);
    expect(found.map(entry => entry.file)).toEqual([join(project.base, 'server/utils/stamp.ts')]);
  });

  it('reports nothing for a util that has no exports now', async () => {
    const project = await collectProject();
    project.write('server/utils/stamp.ts', 'export const stamp = 1;\n');
    project.write('layers/base/server/utils/stamp.ts', 'export const stamp = 2;\n');
    const { dirs } = await twoLayers(project);
    sortAsNuxt(dirs);
    expect(await shadowedServerImports(project)).toHaveLength(1);
    // Nitro's own unimport keeps the old entry of the file, so it still uses it.
    project.write('server/utils/stamp.ts', 'const stamp = 1;\n');
    expect(await shadowedServerImports(project)).toEqual([]);
  });

  it('reports no shared util, because Nitro and the app can use other files', async () => {
    const project = await collectProject();
    project.write('shared/utils/format.ts', 'export const format = 1;\n');
    project.write('layers/base/shared/utils/format.ts', 'export const format = 2;\n');
    const { dirs } = await twoLayers(project);
    sortAsNuxt(dirs);
    expect(await shadowedServerImports(project)).toEqual([]);
  });
});
