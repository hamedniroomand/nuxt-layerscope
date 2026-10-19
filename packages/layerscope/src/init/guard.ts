import { existsSync } from 'node:fs';

import { relative, resolve } from 'pathe';

import { isConfigNewer } from '#src/analyze/config-freshness.ts';
import { BASELINE_FILE } from '#src/baseline/index.ts';
import { hasProjectConfig, keysSet } from '#src/config/effective.ts';
import { findConfigFile, isConfigThere } from '#src/config/load.ts';
import { LayerscopeError } from '#src/errors.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { currentDir } from '#src/utils/fs.ts';

function alreadyExists(file: string): LayerscopeError {
  return new LayerscopeError(
    `${relative(currentDir(), file)} already exists. To keep it, run with --dry-run and copy what you need. To replace it, run with --force.`,
  );
}

/**
 * The config file that exists, whatever its name, or `null`. A `--config` file counts only when it
 * exists. Every check of `init` uses this one value.
 */
export function findExistingConfig(
  rootDir: string,
  customConfig: string | undefined,
): string | null {
  if (customConfig === undefined) {
    return findConfigFile(rootDir);
  }
  return isConfigThere(customConfig) ? customConfig : null;
}

export function assertWritable(
  rootDir: string,
  configFile: string | undefined,
  withBaseline: boolean,
): void {
  const current = configFile ?? findConfigFile(rootDir);
  if (current !== null && existsSync(current)) {
    throw alreadyExists(current);
  }
  const baselineFile = resolve(rootDir, BASELINE_FILE);
  if (withBaseline && existsSync(baselineFile)) {
    throw alreadyExists(baselineFile);
  }
}

export function assertNoNuxtConfigLayers(result: AnalyzeResult, hasConfigFile: boolean): void {
  if (!hasConfigFile && hasProjectConfig(result.config)) {
    // `result.config` has the `layers` that a preset adds, so the keys come from the declared config.
    const keys = keysSet(result.declaredConfig ?? result.config);
    const many = keys.includes(', ');
    // `init` reads the Nuxt data, so a key that was removed from nuxt.config can still show here.
    if (result.recordedFile !== undefined && isConfigNewer(result.rootDir, result.recordedFile)) {
      throw new LayerscopeError(
        `${keys} ${many ? 'are' : 'is'} set in the Nuxt data, but nuxt.config changed after the last Nuxt run, so this data may be out of date. Run init --prepare.`,
      );
    }
    throw new LayerscopeError(
      `${keys} ${many ? 'are' : 'is'} set in the "layerscope" key of nuxt.config (read from the Nuxt data of the last Nuxt run). Move ${many ? 'them' : 'it'} to layerscope.config.ts and remove the key. Then run init --prepare --dry-run and copy the layers and edges you need, because init does not replace an existing config.`,
    );
  }
}
