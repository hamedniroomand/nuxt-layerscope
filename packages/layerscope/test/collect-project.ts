import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'pathe';

import { RegistryCollector } from '#src/module/collect.ts';
import { loadUnimport } from '#src/module/import-dirs.ts';
import type { Component, ComponentsDir, Nuxt, UnimportImport } from '#src/module/nuxt.ts';
import type { Registry } from '#src/registry/schema.ts';

import { NUXT4_ROOT } from './fixtures.ts';

/** The part of a real unimport instance that the tests use. */
export interface RealUnimport {
  getImports: () => Promise<UnimportImport[]>;
  scanImportsFromDir: () => Promise<UnimportImport[]>;
  /** What a module does to add the imports of one file. */
  scanImportsFromFile: (file: string) => Promise<UnimportImport[]>;
  getInternalContext: () => { options: { dirs?: unknown[] } };
}

type CreateUnimport = (options: { dirs: string[]; imports?: UnimportImport[] }) => RealUnimport;

/** The `createUnimport` of the unimport that the Nuxt of the fixture uses. */
async function createUnimport(): Promise<CreateUnimport> {
  const loaded = await loadUnimport(NUXT4_ROOT);
  if (loaded.kind === 'failed') {
    throw new Error(loaded.cause);
  }
  return (loaded.unimport as unknown as { createUnimport: CreateUnimport }).createUnimport;
}

type Handler = (...args: never[]) => unknown;

/**
 * A project on disk and a collector on a fake Nuxt, with an app scan, a Nitro scan and a component
 * dir. The test gives what Nuxt and Nitro return, and fires the hooks of Nuxt by name.
 */
export interface CollectProject {
  base: string;
  collector: RegistryCollector;
  /** The auto-imports that Nuxt's context of the app returns. */
  app: UnimportImport[];
  /** The import dirs of Nitro. */
  nitroDirs: string[];
  /** Nitro's unimport: the real one of the fixture, on the Nitro dirs. */
  nitroUnimport: RealUnimport;
  nuxt: Nuxt & { options: { rootDir: string } };
  call: (name: string, ...args: unknown[]) => Promise<void>;
  write: (file: string, content?: string) => void;
  remove: (file: string) => void;
  /** Fires `components:extend` as Nuxt does after a scan, with the registered files. */
  scanComponents: (files: string[]) => Promise<void>;
  collect: () => Promise<Registry>;
}

/** A copy of the list, as unimport gives one. */
async function current(list: UnimportImport[]): Promise<UnimportImport[]> {
  await Promise.resolve();
  return [...list];
}

function component(file: string): Component {
  const name = file.replace(/^.*\//u, '').replace(/\.vue$/u, '');
  return { pascalName: name, filePath: file } as unknown as Component;
}

/** A fake Nuxt whose hooks the test fires by name. */
function fakeNuxt(base: string): Pick<CollectProject, 'nuxt' | 'call'> {
  const hooks = new Map<string, Handler[]>();
  const nuxt = {
    _version: '0.0.0',
    // `rootDir` finds the unimport of Nuxt, so it is the fixture.
    options: {
      _layers: [],
      alias: {},
      extensions: ['.vue'],
      buildDir: join(base, '.nuxt'),
      rootDir: NUXT4_ROOT,
      // Under `nuxi dev`, the collector scans Nitro's dirs in `nitro:init`. A test that needs it
      // sets `dev` and fires `nitro:init` again, so that the scan sees its files.
      dev: false,
    },
    hook: (name: string, handler: Handler): void => {
      hooks.set(name, [...(hooks.get(name) ?? []), handler]);
    },
  } as unknown as CollectProject['nuxt'];
  const call = async (name: string, ...args: unknown[]): Promise<void> => {
    await Promise.all(
      (hooks.get(name) ?? []).map(handler =>
        (handler as (...values: unknown[]) => unknown)(...args),
      ),
    );
  };
  return { nuxt, call };
}

/** Fires the hooks that give the collector its dirs and the contexts of Nuxt and Nitro. */
async function setupHooks(project: CollectProject): Promise<void> {
  const { base, call } = project;
  for (const dir of ['components', 'composables', 'server/utils', 'shared/utils']) {
    mkdirSync(join(base, dir), { recursive: true });
  }
  await call('modules:done');
  const dirs: ComponentsDir[] = [{ path: join(base, 'components') }];
  await call('components:dirs', dirs);
  await call('imports:dirs', [join(base, 'composables'), join(base, 'shared/utils')]);
  await call('imports:context', {
    getImports: async () => {
      const list = await current(project.app);
      return list;
    },
  });
  await call('nitro:init', {
    options: { imports: { dirs: project.nitroDirs } },
    unimport: project.nitroUnimport,
  });
}

/** `nitroImports`: the static imports of Nitro's unimport, as presets and modules give them. */
export async function collectProject(nitroImports: UnimportImport[] = []): Promise<CollectProject> {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'layerscope-collect-')));
  const { nuxt, call } = fakeNuxt(base);
  const nitroDirs = [join(base, 'server/utils'), join(base, 'shared/utils')];
  const project: CollectProject = {
    base,
    collector: new RegistryCollector(nuxt, {}),
    app: [],
    nitroDirs,
    nitroUnimport: (await createUnimport())({ dirs: nitroDirs, imports: nitroImports }),
    nuxt,
    call,
    write: (file, content = 'export const x = 1;\n') => {
      mkdirSync(dirname(join(base, file)), { recursive: true });
      writeFileSync(join(base, file), content);
    },
    remove: file => {
      rmSync(join(base, file));
    },
    scanComponents: async files => {
      await call(
        'components:extend',
        files.map(file => component(join(base, file))),
      );
    },
    collect: async () => {
      const registry = await project.collector.collect();
      return registry;
    },
  };
  project.collector.install();
  await setupHooks(project);
  return project;
}

/** The files that the registry records for the dirs whose path ends with `suffix`. */
export function recordedFiles(registry: Registry, suffix: string): string[] {
  return [
    ...registry.componentDirs.filter(dir => dir.path.endsWith(suffix)),
    ...(registry.importDirs ?? []).filter(dir => dir.dir.endsWith(suffix)),
  ].flatMap(dir => dir.files);
}
