import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Jiti } from 'jiti';
import { createJiti } from 'jiti';
import { resolve } from 'pathe';

import { LayerscopeError } from '#src/errors.ts';
import type { LayerscopeConfig } from '#src/types.ts';

import { validateConfig } from './validate.ts';

const CONFIG_NAMES = [
  'layerscope.config.ts',
  'layerscope.config.mts',
  'layerscope.config.js',
  'layerscope.config.mjs',
];

/**
 * Config files import `defineConfig` from this package. Aliasing it to our own module lets
 * them load even when layerscope runs through npx without being a project dependency.
 */
function defineConfigModule(): string {
  const candidates = ['./define.ts', './define.mjs'].map(path =>
    fileURLToPath(new URL(path, import.meta.url)),
  );
  return candidates.find(path => existsSync(path)) ?? candidates[0];
}

function findConfigFile(rootDir: string, configFile?: string): string | null {
  if (configFile !== undefined) {
    const file = resolve(process.cwd(), configFile);
    if (!existsSync(file)) {
      throw new LayerscopeError(`Config file not found: ${file}`);
    }
    return file;
  }
  return CONFIG_NAMES.map(name => resolve(rootDir, name)).find(path => existsSync(path)) ?? null;
}

function createLoader(): Jiti {
  const self = defineConfigModule();
  return createJiti(import.meta.url, {
    alias: { 'nuxt-layerscope': self, layerscope: self },
    moduleCache: false,
  });
}

function toConfig(value: unknown, file: string): LayerscopeConfig {
  if (typeof value !== 'object' || value === null) {
    throw new LayerscopeError(`${file} must default-export a config object`);
  }
  validateConfig(value, file);
  return value;
}

function loadFailed(file: string, error: unknown): LayerscopeError {
  return new LayerscopeError(`Failed to load ${file}: ${(error as Error).message}`);
}

export async function loadConfig(rootDir: string, configFile?: string): Promise<LayerscopeConfig> {
  const file = findConfigFile(rootDir, configFile);
  if (file === null) {
    return {};
  }
  const config = await createLoader()
    .import(file, { default: true })
    .catch((error: unknown) => {
      throw loadFailed(file, error);
    });
  return toConfig(config, file);
}

function requireConfig(file: string): unknown {
  try {
    return createLoader()(file);
  } catch (error) {
    throw loadFailed(file, error);
  }
}

/** For callers that cannot await, such as lint rules. */
export function loadConfigSync(rootDir: string): LayerscopeConfig {
  const file = findConfigFile(rootDir);
  if (file === null) {
    return {};
  }
  const module = requireConfig(file) as { default?: unknown } | null;
  return toConfig(module?.default ?? module, file);
}

export { findConfigFile };
