import { getLayerDirectories } from '@nuxt/kit';
import { isAbsolute, resolve } from 'pathe';

import type { ProjectConfig } from '#src/config/effective.ts';
import { layerFromNuxt } from '#src/nuxt/layer-factory.ts';
import { globComponents } from '#src/registry/component-files.ts';
import type {
  ComponentMode,
  Registry,
  RegistryComponent,
  RegistryComponentDir,
  RegistryImport,
  ShadowedComponent,
} from '#src/registry/schema.ts';
import { REGISTRY_VERSION } from '#src/registry/schema.ts';
import type { Context, Layer } from '#src/types.ts';
import { compareStrings } from '#src/utils/strings.ts';
import { packageVersion } from '#src/version.ts';

import type { Component, ComponentsDir, Nitro, Nuxt, Unimport, UnimportImport } from './nuxt.ts';
import { onNitroInit } from './nuxt.ts';

// Same defaults as Nuxt's components module.
const COMPONENT_IGNORE = [
  '**/*{M,.m,-m}ixin.{js,ts,jsx,tsx}',
  '**/*.{d.ts,d.mts,d.cts,d.vue.ts,d.vue.mts,d.vue.cts}',
];

// Written by hand into `shared-imports.d.ts`: available in both app and server code.
const SHARED_BUILTINS: RegistryImport[] = [
  { name: 'useRuntimeConfig', from: 'nuxt' },
  { name: 'useAppConfig', from: 'nuxt' },
  { name: 'defineAppConfig', from: 'nuxt' },
  { name: 'createError', from: 'h3' },
  { name: 'setResponseStatus', from: 'h3' },
];
const SHARED_BUILTIN_NAMES = new Set(SHARED_BUILTINS.map(entry => entry.name));

const SERVER_PLACEHOLDER = '/components/server-placeholder';

type AliasMap = Record<string, string>;

function resolveAlias(path: string, aliases: AliasMap): string {
  const key = Object.keys(aliases)
    .toSorted((a, b) => b.length - a.length)
    .find(alias => path === alias || path.startsWith(`${alias}/`));
  return key === undefined ? path : aliases[key] + path.slice(key.length);
}

function toMode(mode: string | undefined): ComponentMode {
  return mode === 'client' || mode === 'server' ? mode : 'all';
}

function byName<T extends { name: string }>(entries: T[]): T[] {
  return entries.toSorted((a, b) => compareStrings(a.name, b.name));
}

function importName(entry: UnimportImport): string {
  return entry.as ?? entry.name;
}

async function activeImports(context: Unimport | null | undefined): Promise<UnimportImport[]> {
  const imports = context === null || context === undefined ? [] : await context.getImports();
  return imports.filter(entry => entry.type !== true && entry.disabled !== true);
}

function toRegistryImports(imports: UnimportImport[], aliases: AliasMap): RegistryImport[] {
  return byName(
    imports.map(entry => {
      const from = resolveAlias(entry.from, aliases);
      return { name: importName(entry), from: isAbsolute(from) ? resolve(from) : from };
    }),
  );
}

function withoutDot(extension: string): string {
  return extension.replace(/^\./u, '');
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
    });
    nuxt.hook('imports:context', context => {
      this.appImports = context;
    });
    onNitroInit(nuxt, nitro => {
      this.nitro = nitro;
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

  public async collect(): Promise<Registry> {
    const [componentDirs, imports] = await Promise.all([this.componentDirs(), this.imports()]);
    const layers = this.layers();
    const components = this.components();
    return {
      version: REGISTRY_VERSION,
      generator: {
        name: 'nuxt-layerscope',
        version: packageVersion(),
        nuxt: this.nuxt._version,
      },
      layers,
      components,
      shadowedComponents: this.shadowed(components),
      componentDirs,
      imports,
      ...(Object.keys(this.config).length > 0 ? { config: this.config } : {}),
    };
  }

  private layers(): Layer[] {
    const dirs = getLayerDirectories(this.nuxt);
    return this.nuxt.options._layers.map((layer, index) =>
      layerFromNuxt(layer, index, dirs[index]),
    );
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
      priority: component.priority ?? 0,
    };
  }

  private components(): RegistryComponent[] {
    return this.registered
      .filter(component => !component.filePath.includes(SERVER_PLACEHOLDER))
      .map(component => this.toComponent(component));
  }

  private shadowed(registered: RegistryComponent[]): ShadowedComponent[] {
    const files = new Set(registered.map(component => component.file));
    const shadowed = this.lastScan
      .map(component => this.toComponent(component))
      .filter(component => !files.has(component.file))
      .flatMap(component => {
        // Nuxt replaces a component of the same name whose mode is `all` or the same.
        const winner = registered.find(
          other =>
            other.name === component.name &&
            (other.mode === 'all' || component.mode === 'all' || other.mode === component.mode),
        );
        return winner === undefined ? [] : [{ ...component, shadowedBy: winner.file }];
      });
    return shadowed.toSorted((a, b) => compareStrings(a.file, b.file));
  }

  private async componentDirs(): Promise<RegistryComponentDir[]> {
    const { alias, extensions } = this.nuxt.options;
    const jobs = this.dirs.map(async dir => {
      const path = resolve(resolveAlias(dir.path, alias));
      const exts = (dir.extensions ?? extensions).map(ext => withoutDot(ext));
      const pattern =
        dir.pattern ?? (exts.length > 1 ? `**/*.{${exts.join(',')}}` : `**/*.${exts[0] ?? '*'}`);
      const ignore = [...COMPONENT_IGNORE, ...(dir.ignore ?? [])];
      // Dependencies are not checked, so their files are not recorded.
      const files = path.includes('/node_modules/')
        ? []
        : await globComponents(path, pattern, ignore);
      return { path, pattern, ignore, files };
    });
    const dirs = await Promise.all(jobs);
    return dirs;
  }

  private async imports(): Promise<Record<Context, RegistryImport[]>> {
    const serverContext = this.nitro?.unimport;
    // Nitro scans its import dirs when it writes types, which may run after this hook.
    await serverContext?.init?.();
    const app = await activeImports(this.appImports);
    const server = await activeImports(serverContext);
    // Nuxt's rule for `shared-imports.d.ts`: same name and same unresolved source in both.
    const serverFrom = new Map(server.map(entry => [importName(entry), entry.from]));
    const shared = app.filter(
      entry =>
        !SHARED_BUILTIN_NAMES.has(importName(entry)) &&
        serverFrom.get(importName(entry)) === entry.from,
    );
    const nuxtAliases = this.nuxt.options.alias;
    const serverAliases = { ...nuxtAliases, ...this.nitro?.options.alias };
    return {
      app: toRegistryImports(app, nuxtAliases),
      server: toRegistryImports(server, serverAliases),
      shared: byName([...SHARED_BUILTINS, ...toRegistryImports(shared, nuxtAliases)]),
    };
  }
}
