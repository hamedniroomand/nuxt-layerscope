import { defineNuxtModule } from '@nuxt/kit';
import { join } from 'pathe';

import type { ProjectConfig } from '#src/config/effective.ts';
import { pickProjectConfig } from '#src/config/effective.ts';
import { setupDevtools, setupStaticDevtools } from '#src/devtools/index.ts';
import { REGISTRY_FILE } from '#src/registry/schema.ts';
import { packageVersion } from '#src/version.ts';

import { RegistryCollector } from './collect.ts';
import { writeOnDevChanges, writeOnPrepareTypes } from './dev-writes.ts';
import { RegistryWriter } from './writer.ts';

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
    const writer = new RegistryWriter(join(nuxt.options.buildDir, REGISTRY_FILE), async () => {
      return `${JSON.stringify(await collector.collect(), null, 2)}\n`;
    });
    // A soft restart of `nuxi dev` makes a new Nuxt, and the old handlers can still run.
    nuxt.hook('close', () => {
      writer.close();
    });
    // Runs on `nuxi prepare`, `nuxi build` and the first `nuxi dev` build.
    writeOnPrepareTypes(nuxt, async () => {
      await writer.request();
    });
    if (nuxt.options.dev) {
      let invalidateTab = (): void => undefined;
      writeOnDevChanges(nuxt, {
        request: async () => {
          await writer.request();
        },
        isNitroImportFile: file => collector.isNitroImportFile(file),
        afterWatchWrite: () => {
          invalidateTab();
        },
      });
      // After the write hooks: the tab handles `app:templatesGenerated` after the write.
      if (options.devtools !== false) {
        invalidateTab = setupDevtools(nuxt);
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
