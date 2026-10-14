import { join } from 'pathe';
import { describe, expect, it, vi } from 'vite-plus/test';

import { assertComponentDirsFresh } from '#src/analyze/component-dirs-fresh.ts';
import { assertImportDirsFresh } from '#src/analyze/import-dirs-fresh.ts';
import { collectProject, recordedFiles } from '#test/collect-project.ts';

const kit = vi.hoisted(() => ({ warn: vi.fn<(text: string) => void>() }));

// The recorder warns when it cannot read the import dirs. These tests do not check the text.
vi.mock('@nuxt/kit', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useLogger: (): { warn: typeof kit.warn } => ({ warn: kit.warn }),
}));

describe('the app part of the collector', () => {
  it('reads it in the first collect', async () => {
    const project = await collectProject();
    project.write('components/Card.vue');
    await project.scanComponents(['components/Card.vue']);
    const registry = await project.collect();
    expect(registry.components.map(item => item.name)).toEqual(['Card']);
    expect(recordedFiles(registry, 'components')).toEqual([
      join(project.base, 'components/Card.vue'),
    ]);
  });

  it('keeps the last one until Nuxt scans the app again, also when files on disk change', async () => {
    const project = await collectProject();
    await project.collect();
    project.write('components/New.vue');
    project.write('composables/useNew.ts');
    const registry = await project.collect();
    expect(registry.components).toEqual([]);
    expect(recordedFiles(registry, 'components')).toEqual([]);
    expect(recordedFiles(registry, 'composables')).toEqual([]);
  });

  it('reads it again after components:extend', async () => {
    const project = await collectProject();
    await project.collect();
    project.write('components/New.vue');
    await project.scanComponents(['components/New.vue']);
    const registry = await project.collect();
    expect(registry.components.map(item => item.name)).toEqual(['New']);
    expect(recordedFiles(registry, 'components')).toEqual([
      join(project.base, 'components/New.vue'),
    ]);
  });

  it('reads it again after app:templatesGenerated', async () => {
    const project = await collectProject();
    await project.collect();
    project.write('composables/useNew.ts');
    project.app.push({ name: 'useNew', from: join(project.base, 'composables/useNew.ts') });
    await project.call('app:templatesGenerated');
    const registry = await project.collect();
    expect(registry.imports.app.map(item => item.name)).toEqual(['useNew']);
    expect(recordedFiles(registry, 'composables')).toEqual([
      join(project.base, 'composables/useNew.ts'),
    ]);
  });
});

describe('the Nitro part of the collector', () => {
  it('reads the Nitro dirs and imports again in each collect', async () => {
    const project = await collectProject();
    await project.collect();
    project.write('server/utils/a.ts', 'export const a = 1;\n');
    const registry = await project.collect();
    expect(registry.imports.server.map(item => item.name)).toEqual(['a']);
    expect(recordedFiles(registry, 'server/utils')).toEqual([
      join(project.base, 'server/utils/a.ts'),
    ]);
    expect(project.collector.isNitroImportFile(join(project.base, 'server/utils/a.ts'))).toBe(true);
    expect(project.collector.isNitroImportFile(join(project.base, 'composables/useNew.ts'))).toBe(
      false,
    );
  });

  it('keeps the app entry of a dir that is in both scans, so a new file there gives the stale error', async () => {
    const project = await collectProject();
    await project.collect();
    project.write('shared/utils/format.ts');
    const registry = await project.collect();
    const shared = (registry.importDirs ?? []).filter(dir => dir.dir.endsWith('shared/utils'));
    expect(shared).toHaveLength(1);
    expect(shared[0]?.files).toEqual([]);
    expect(project.collector.isNitroImportFile(join(project.base, 'shared/utils/format.ts'))).toBe(
      true,
    );
    await expect(assertImportDirsFresh(registry.importDirs ?? [])).rejects.toThrow(
      /shared\/utils\/format\.ts is missing from the layerscope registry/u,
    );
  });
});

describe('a write before Nuxt scans the app again', () => {
  it('gives the stale error for a new component, and a clean check after the scan', async () => {
    const project = await collectProject();
    await project.collect();
    project.write('components/New.vue');
    // The watcher event comes before Nuxt's scan: the write must not record the file alone.
    const early = await project.collect();
    await expect(assertComponentDirsFresh(early.componentDirs)).rejects.toThrow(
      /components\/New\.vue is missing from the layerscope registry/u,
    );
    await project.scanComponents(['components/New.vue']);
    const late = await project.collect();
    await expect(assertComponentDirsFresh(late.componentDirs)).resolves.toBeUndefined();
    expect(late.components.map(item => item.name)).toEqual(['New']);
  });
});
