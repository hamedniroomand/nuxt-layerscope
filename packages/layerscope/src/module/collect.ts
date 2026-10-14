import { isAbsolute, resolve } from 'pathe';

import type { ProjectConfig } from '#src/config/effective.ts';
import type { NuxtOptions } from '#src/nuxt/kit.ts';
import { layersForModule } from '#src/nuxt/layers.ts';
import type {
  ComponentMode,
  Registry,
  RegistryComponent,
  RegistryComponentDir,
  RegistryImportDir,
  ShadowedComponent,
} from '#src/registry/schema.ts';
import { REGISTRY_VERSION } from '#src/registry/schema.ts';
import { packageVersion } from '#src/version.ts';

import { recordComponentDirs, shadowedBy } from './components.ts';
import { ImportDirRecorder, mergeImportDirs } from './import-dirs.ts';
import { NitroImports, activeImports, registryImports, resolveAlias } from './imports.ts';
import type { Component, ComponentsDir, Nitro, Nuxt, Unimport, UnimportImport } from './nuxt.ts';
import { onNitroInit, readNuxtIgnore, usesNuxtContent } from './nuxt.ts';

const SERVER_PLACEHOLDER = '/components/server-placeholder';

function toMode(mode: string | undefined): ComponentMode {
  return mode === 'client' || mode === 'server' ? mode : 'all';
}

/** What Nuxt's own scan of the app gives: components, app auto-imports and their dirs. */
interface AppPart {
  componentDirs: RegistryComponentDir[];
  components: RegistryComponent[];
  shadowedComponents: ShadowedComponent[];
  /** Not resolved yet: the shared imports compare the raw `from` with the server imports. */
  imports: UnimportImport[];
  importDirs: RegistryImportDir[] | null;
}

/**
 * Records what Nuxt resolves while it prepares or builds the app. Nuxt drops overridden
 * components before `components:extend`, so each component dir's `extendComponent` is wrapped to
 * see every scanned component, including the ones a higher-priority layer replaces.
 */
export class RegistryCollector {
  private readonly nuxt: Nuxt;
  private readonly config: ProjectConfig;
  private dirs: ComponentsDir[] = [];
  /** Filled while Nuxt scans the dirs, by file. Moved to `lastScan` once the scan is done. */
  private readonly scanned = new Map<string, Component>();
  /** The last complete scan: `nuxi dev` rescans all dirs on a change, so deleted files drop out. */
  private lastScan: Component[] = [];
  private registered: Component[] = [];
  private appImports: Unimport | null = null;
  private nitro: Nitro | null = null;
  private readonly importDirs = new ImportDirRecorder();
  private readonly nitroImports = new NitroImports();
  /** The app part of the last collect. */
  private app: AppPart | null = null;
  /** Nuxt scanned the app again after the last collect read the app part. */
  private appScanned = true;

  public constructor(nuxt: Nuxt, config: ProjectConfig) {
    this.config = config;
    this.nuxt = nuxt;
  }

  public install(): void {
    const { nuxt } = this;
    // Registered once every module is set up, so dirs added by other modules are wrapped too.
    nuxt.hook('modules:done', () => {
      nuxt.hook('components:dirs', dirs => {
        this.wrapDirs(dirs);
      });
    });
    nuxt.hook('components:extend', components => {
      // Nuxt keeps adding to this list (server placeholders); it is read when writing.
      this.registered = components;
      // Nuxt scans every dir before this hook, so this pass is complete.
      this.lastScan = [...this.scanned.values()];
      this.scanned.clear();
      this.appScanned = true;
    });
    // Nuxt writes its templates after it scans components and app auto-imports again.
    nuxt.hook('app:templatesGenerated', () => {
      this.appScanned = true;
    });
    // Nuxt keeps this array and modules add to it, so it is read when the registry is written.
    nuxt.hook('imports:dirs', dirs => {
      this.importDirs.appDirs = dirs;
    });
    nuxt.hook('imports:context', context => {
      this.appImports = context;
    });
    onNitroInit(nuxt, async nitro => {
      this.nitro = nitro;
      if (nuxt.options.dev) {
        await this.nitroImports.start(nitro.unimport);
      }
    });
  }

  private wrapDirs(dirs: (string | ComponentsDir)[]): void {
    // Each call receives the full list.
    this.dirs = [];
    for (const [index, entry] of dirs.entries()) {
      const dir = typeof entry === 'string' ? { path: entry } : entry;
      const extend = dir.extendComponent;
      dir.extendComponent = async (component): Promise<Component> => {
        const result = (extend === undefined ? undefined : await extend(component)) ?? component;
        this.scanned.set(result.filePath, result);
        return result;
      };
      dirs[index] = dir;
      this.dirs.push(dir);
    }
  }

  /**
   * Builds and returns the registry from two parts: the app part (components and app
   * auto-imports) and the Nitro part (server auto-imports).
   *
   * The app part comes only from the scan of Nuxt. Under `nuxi dev`, a write can start from a
   * watcher event before Nuxt scans the app again. Then the globs of the dirs find a new
   * component, but the list of Nuxt does not have it yet. The stale check would pass, and the
   * analysis would miss the component. So the app part is read again only after
   * `components:extend` or `app:templatesGenerated`. Else the last app part is used. Its file
   * lists and its symbols agree, so a new file gives the stale error until Nuxt scans again.
   *
   * Limit: Nuxt starts `generateApp` with a leading debounce of 25 ms. It does not run again for a
   * call in the 25 ms after the call before. A file that is added in that time can stay out of the
   * scan of Nuxt until the next file event. The stale error for that file then stays until the
   * next scan or `nuxi prepare`.
   *
   * The Nitro part is read again in each collect, in any order: the collect scans the dirs of
   * Nitro again with Nitro's own unimport (see `NitroImports`).
   */
  public async collect(): Promise<Registry> {
    const { rootDir } = this.nuxt.options;
    const [app, nitroDirs, server] = await Promise.all([
      this.appPart(),
      this.importDirs.recordNitro(rootDir, this.nitro),
      this.nitroImports.read(this.nitro?.unimport, this.nuxt.options.rootDir),
    ]);
    const importDirs =
      app.importDirs === null || nitroDirs === null
        ? null
        : mergeImportDirs([app.importDirs, nitroDirs]);
    // From the project's own kit, as the CLI does. The fields that layerscope reads are the same in
    // the schema type and in its own subset type.
    const { options } = this.nuxt;
    const layers = await layersForModule(rootDir, options as unknown as NuxtOptions);
    return {
      version: REGISTRY_VERSION,
      generator: {
        name: 'nuxt-layerscope',
        version: packageVersion(),
        nuxt: this.nuxt._version,
      },
      layers,
      components: app.components,
      shadowedComponents: app.shadowedComponents,
      componentDirs: app.componentDirs,
      importDirs,
      nuxtIgnore: readNuxtIgnore(this.nuxt),
      nuxtContent: usesNuxtContent(this.nuxt),
      imports: this.imports(app.imports, server),
      ...(Object.keys(this.config).length > 0 ? { config: this.config } : {}),
    };
  }

  /** Whether the last collect recorded the file in an import dir of Nitro. */
  public isNitroImportFile(file: string): boolean {
    return this.importDirs.isNitroFile(file);
  }

  private async appPart(): Promise<AppPart> {
    if (this.app !== null && !this.appScanned) {
      return this.app;
    }
    // Cleared before the reads: a scan during them sets it again for the next collect.
    this.appScanned = false;
    const [componentDirs, imports, importDirs] = await Promise.all([
      this.componentDirs(),
      activeImports(this.appImports),
      this.importDirs.recordApp(this.nuxt.options.rootDir),
    ]);
    const components = this.components();
    this.app = {
      componentDirs,
      components,
      shadowedComponents: this.shadowed(components),
      imports,
      importDirs,
    };
    return this.app;
  }

  private toFile(path: string): string {
    const file = resolveAlias(path, this.nuxt.options.alias);
    return isAbsolute(file) ? resolve(file) : file;
  }

  private toComponent(component: Component): RegistryComponent {
    return {
      name: component.pascalName,
      file: this.toFile(component.filePath),
      mode: toMode(component.mode),
      island: component.island === true,
      // Nuxt sets `global` to `'sync'` for a component that it registers without a lazy import.
      global: component.global === true || component.global === 'sync',
      priority: component.priority ?? 0,
    };
  }

  private components(): RegistryComponent[] {
    return this.registered
      .filter(component => !component.filePath.includes(SERVER_PLACEHOLDER))
      .map(component => this.toComponent(component));
  }

  private shadowed(registered: RegistryComponent[]): ShadowedComponent[] {
    return shadowedBy(
      this.lastScan.map(component => this.toComponent(component)),
      registered,
    );
  }

  private async componentDirs(): Promise<RegistryComponentDir[]> {
    const { alias, extensions } = this.nuxt.options;
    const dirs = await recordComponentDirs(
      this.dirs.map(dir => ({ ...dir, path: resolve(resolveAlias(dir.path, alias)) })),
      extensions,
    );
    return dirs;
  }

  private imports(app: UnimportImport[], server: UnimportImport[]): Registry['imports'] {
    const nuxtAliases = this.nuxt.options.alias;
    return registryImports(app, server, nuxtAliases, {
      ...nuxtAliases,
      ...this.nitro?.options.alias,
    });
  }
}
