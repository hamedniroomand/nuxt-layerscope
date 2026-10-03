import { mkdir, writeFile } from 'node:fs/promises';

import { defineNuxtModule } from '@nuxt/kit';
import { dirname, join } from 'pathe';

import type { ProjectConfig } from '#src/config/effective.ts';
import { pickProjectConfig } from '#src/config/effective.ts';
import { setupDevtools, setupStaticDevtools } from '#src/devtools/index.ts';
import { REGISTRY_FILE } from '#src/registry/schema.ts';
import { packageVersion } from '#src/version.ts';

import { RegistryCollector } from './collect.ts';

export interface ModuleOptions extends ProjectConfig {
  /** Write `.nuxt/layerscope/registry.json`. Defaults to `true`. */
  enabled: boolean;
  /**
   * Add a Layerscope tab to Nuxt DevTools while `nuxi dev` runs. Defaults to `true`. With
   * `{ static: true }`, `nuxi build` and `nuxi generate` also write a read-only snapshot of the tab
   * to `/__layerscope/` in the public output.
   */
  devtools: boolean | { static?: boolean };
}

async function writeRegistry(collector: RegistryCollector, buildDir: string): Promise<void> {
  const file = join(buildDir, REGISTRY_FILE);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(await collector.collect(), null, 2)}\n`);
}

/**
 * Records the registry Nuxt resolves (layers, components including overridden ones, app and
 * server auto-imports) into `.nuxt/layerscope/registry.json` for the `layerscope` CLI.
 */
export const layerscopeModule = defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-layerscope',
    configKey: 'layerscope',
    version: packageVersion(),
    compatibility: { nuxt: '>=3.12.0' },
  },
  defaults: { enabled: true, devtools: true },
  setup(options, nuxt) {
    if (!options.enabled) {
      return;
    }
    const collector = new RegistryCollector(nuxt, pickProjectConfig(options));
    collector.install();
    const write = async (): Promise<void> => {
      await writeRegistry(collector, nuxt.options.buildDir);
    };
    // Runs on `nuxi prepare`, `nuxi build` and the first `nuxi dev` build.
    nuxt.hook('prepare:types', write);
    if (nuxt.options.dev) {
      // Components and imports are rescanned while `nuxi dev` runs.
      nuxt.hook('app:templatesGenerated', write);
      if (options.devtools !== false) {
        setupDevtools(nuxt);
      }
    } else if (typeof options.devtools === 'object' && options.devtools.static === true) {
      setupStaticDevtools(nuxt);
    }
  },
});

declare module '@nuxt/schema' {
  interface NuxtConfig {
    layerscope?: Partial<ModuleOptions>;
  }
  interface NuxtOptions {
    layerscope: ModuleOptions;
  }
}
