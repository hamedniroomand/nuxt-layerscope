import { join, normalize } from 'pathe';
import { describe, expect, it, vi } from 'vite-plus/test';

import type { UnimportImport } from '#src/module/nuxt.ts';
import { collectProject } from '#test/collect-project.ts';
import type { CollectProject } from '#test/collect-project.ts';

const kit = vi.hoisted(() => ({ warn: vi.fn<(text: string) => void>() }));

// The recorder warns when it cannot read the import dirs. These tests do not check the text.
vi.mock('@nuxt/kit', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useLogger: (): { warn: typeof kit.warn } => ({ warn: kit.warn }),
}));

async function serverNames(project: CollectProject): Promise<string[]> {
  const registry = await project.collect();
  return registry.imports.server.map(item => item.name);
}

/** Where the registry says that `name` comes from, as a path in the project or a module name. */
async function sourceOf(project: CollectProject, name: string): Promise<string | undefined> {
  const registry = await project.collect();
  const from = registry.imports.server.find(item => item.name === name)?.from;
  return from?.replace(`${normalize(project.base)}/`, '');
}

/** Two server utils on disk, in Nitro's real unimport. */
async function twoUtils(): Promise<CollectProject> {
  const project = await collectProject();
  project.write('server/utils/a.ts', 'export const a = 1;\n');
  project.write('server/utils/b.ts', 'export const b = 1;\n');
  return project;
}

/** Nitro starts under `nuxi dev`: its `nitro:init` with the same unimport. */
async function nitroInit(project: CollectProject): Promise<void> {
  project.nuxt.options.dev = true;
  await project.call('nitro:init', {
    options: { imports: { dirs: project.nitroDirs } },
    unimport: project.nitroUnimport,
  });
}

describe('the collector and the server imports that a new scan does not give', () => {
  it('drops the import of a server util that is deleted', async () => {
    const project = await twoUtils();
    expect(await serverNames(project)).toEqual(['a', 'b']);
    project.remove('server/utils/b.ts');
    expect(await serverNames(project)).toEqual(['a']);
    // unimport itself keeps `b` in Nitro's list after the delete and the scan.
    expect((await project.nitroUnimport.getImports()).map(item => item.name)).toContain('b');
  });

  it('drops the import of a server util that has no exports now', async () => {
    const project = await twoUtils();
    await project.collect();
    project.write('server/utils/b.ts', 'function b() {\n  return 1;\n}\n');
    expect(await serverNames(project)).toEqual(['a']);
  });

  it('keeps an import that a module adds from a file outside the dirs', async () => {
    const project = await twoUtils();
    project.write('modules/runtime/extra.ts', 'export const extra = 1;\n');
    await project.nitroUnimport.scanImportsFromFile(join(project.base, 'modules/runtime/extra.ts'));
    expect(await serverNames(project)).toEqual(['a', 'b', 'extra']);
    project.remove('server/utils/b.ts');
    expect(await serverNames(project)).toEqual(['a', 'extra']);
  });

  it('keeps the import of a file that is deleted and then added again', async () => {
    const project = await twoUtils();
    await project.collect();
    project.remove('server/utils/b.ts');
    await project.collect();
    project.write('server/utils/b.ts', 'export const b = 1;\n');
    expect(await serverNames(project)).toEqual(['a', 'b']);
  });
});

describe('the collector and a server util with the name of another import', () => {
  it('gives the static import again after the util that hid it is deleted', async () => {
    const project = await collectProject([{ name: 'getQuery', from: 'h3' }]);
    project.write('server/utils/q.ts', 'export const getQuery = () => 1;\n');
    expect(await sourceOf(project, 'getQuery')).toBe('server/utils/q.ts');
    project.remove('server/utils/q.ts');
    expect(await sourceOf(project, 'getQuery')).toBe('h3');
  });

  it('gives the module import again after the util that hid it is deleted', async () => {
    const project = await collectProject();
    project.write('modules/runtime/foo.ts', 'export const foo = 1;\n');
    await project.nitroUnimport.scanImportsFromFile(join(project.base, 'modules/runtime/foo.ts'));
    project.write('server/utils/foo.ts', 'export const foo = 2;\n');
    expect(await sourceOf(project, 'foo')).toBe('server/utils/foo.ts');
    project.remove('server/utils/foo.ts');
    expect(await sourceOf(project, 'foo')).toBe('modules/runtime/foo.ts');
  });
});

describe('the collector and the first scan of Nitro', () => {
  it('drops a server util that is deleted after nitro:init and before the first collect', async () => {
    const project = await twoUtils();
    // Nitro's own scan when it starts, before `nitro:init`.
    await project.nitroUnimport.scanImportsFromDir();
    await nitroInit(project);
    project.remove('server/utils/b.ts');
    expect(await serverNames(project)).toEqual(['a']);
  });

  it('keeps an entry that Nitro scanned before nitro:init (the known limit)', async () => {
    const project = await twoUtils();
    // Nitro's own scan when it starts, before `nitro:init`.
    await project.nitroUnimport.scanImportsFromDir();
    project.remove('server/utils/b.ts');
    await nitroInit(project);
    expect(await serverNames(project)).toEqual(['a', 'b']);
  });

  it('drops nothing with an unimport that has no scanImportsFromDir', async () => {
    const project = await twoUtils();
    await project.collect();
    project.remove('server/utils/b.ts');
    const { getImports } = project.nitroUnimport;
    const init = async (): Promise<void> => {
      await project.nitroUnimport.scanImportsFromDir();
    };
    await project.call('nitro:init', {
      options: { imports: { dirs: project.nitroDirs } },
      unimport: { getImports, init },
    });
    expect(await serverNames(project)).toEqual(['a', 'b']);
  });
});

describe('the collector and a failed first scan of Nitro', () => {
  /** Nitro's unimport, with a scan that fails `failures` times and counts each call. */
  function flaky(project: CollectProject, failures: number): { scans: () => number } {
    let calls = 0;
    let left = failures;
    const real = project.nitroUnimport;
    const scanImportsFromDir = async (): Promise<UnimportImport[]> => {
      calls += 1;
      if (left > 0) {
        left -= 1;
        throw Object.assign(new Error('file went away'), { code: 'ENOENT' });
      }
      const scanned = await real.scanImportsFromDir();
      return scanned;
    };
    project.nitroUnimport = { ...real, scanImportsFromDir };
    return { scans: () => calls };
  }

  it('loses only the history, and later collects scan and give the registry', async () => {
    const project = await twoUtils();
    const { scans } = flaky(project, 1);
    await nitroInit(project);
    expect(await serverNames(project)).toEqual(['a', 'b']);
    project.remove('server/utils/b.ts');
    expect(await serverNames(project)).toEqual(['a']);
    expect(scans()).toBe(3);
  });

  it('does not scan in nitro:init when Nuxt does not run in dev mode', async () => {
    const project = await twoUtils();
    const { scans } = flaky(project, 0);
    await project.call('nitro:init', {
      options: { imports: { dirs: project.nitroDirs } },
      unimport: project.nitroUnimport,
    });
    expect(scans()).toBe(0);
  });
});
