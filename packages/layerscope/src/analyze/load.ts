import { resolve } from 'pathe';

import { loadConfig } from '#src/config/load.ts';
import type { LayerscopeConfig, SourceOption } from '#src/types.ts';

import type { EnvironmentCache } from './cache.ts';
import type { Environment, EnvironmentOptions } from './environment.ts';
import { loadEnvironment } from './environment.ts';
import { prepareNuxt } from './prepare.ts';

export interface LoadOptions {
  rootDir: string;
  configFile?: string;
  config?: LayerscopeConfig;
  prepare?: boolean;
  source?: SourceOption;
  /** Changes when the symbol table or config changes. */
  envKey?: string;
  /** Reuses the loaded layers and symbols while `envKey` holds. */
  environment?: EnvironmentCache;
}

async function environmentOf(
  options: LoadOptions,
  input: EnvironmentOptions,
): Promise<Environment> {
  const { environment, envKey } = options;
  if (environment === undefined || envKey === undefined) {
    const fresh = await loadEnvironment(input);
    return fresh;
  }
  // The config object is part of the key: a caller can pass one that the env key does not see.
  const key = JSON.stringify([envKey, input.buildDir, input.source, input.config]);
  const cached = await environment.get(key, async () => {
    const loaded = await loadEnvironment(input);
    return loaded;
  });
  return cached;
}

/** The config file, `nuxi prepare` when asked, and the layers and symbols of the project. */
export async function loadProject(options: LoadOptions): Promise<Environment> {
  const { rootDir } = options;
  const fileConfig = options.config ?? (await loadConfig(rootDir, options.configFile));
  const buildDir = resolve(rootDir, fileConfig.buildDir ?? '.nuxt');
  if (options.prepare === true) {
    prepareNuxt(rootDir);
  }
  return environmentOf(options, {
    rootDir,
    buildDir,
    config: fileConfig,
    source: options.source ?? 'auto',
  });
}
