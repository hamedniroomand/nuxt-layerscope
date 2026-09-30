import { existsSync } from 'node:fs';

import { relative, resolve } from 'pathe';

import { BASELINE_FILE } from '#src/baseline/index.ts';
import { hasProjectConfig } from '#src/config/effective.ts';
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
    throw new LayerscopeError(
      'Layers or rules are already set in the "layerscope" key of nuxt.config. Move them to layerscope.config.ts, or remove the key and run init again.',
    );
  }
}
