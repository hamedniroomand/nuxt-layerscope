import { existsSync } from 'node:fs';

import { relative, resolve } from 'pathe';

import { isConfigNewer } from '#src/analyze/config-freshness.ts';
import { BASELINE_FILE } from '#src/baseline/index.ts';
import { hasProjectConfig, keysSet } from '#src/config/effective.ts';
import { findConfigFile } from '#src/config/load.ts';
import { LayerscopeError } from '#src/errors.ts';
import type { AnalyzeResult } from '#src/types.ts';

function alreadyExists(file: string): LayerscopeError {
  return new LayerscopeError(
    `${relative(process.cwd(), file)} already exists. Use --force to replace it, or --dry-run and copy what you need.`,
  );
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
    // `init` reads the .nuxt data, so a key that was removed from nuxt.config can still show here.
    if (result.recordedFile !== undefined && isConfigNewer(result.rootDir, result.recordedFile)) {
      throw new LayerscopeError(
        `${keys} ${many ? 'are' : 'is'} set in the .nuxt data, but nuxt.config changed after the last Nuxt run, so this data may be out of date. Run init --prepare.`,
      );
    }
    throw new LayerscopeError(
      `${keys} ${many ? 'are' : 'is'} set in the "layerscope" key of nuxt.config (read from the .nuxt data of the last Nuxt run). Move ${many ? 'them' : 'it'} to layerscope.config.ts and remove the key, then run init --prepare.`,
    );
  }
}
