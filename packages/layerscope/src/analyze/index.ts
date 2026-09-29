import { resolve } from 'pathe';

import { applyBaselineFile } from '#src/baseline/index.ts';
import { loadConfig } from '#src/config/load.ts';
import { compareByPosition } from '#src/rules/compare.ts';
import { runRules } from '#src/rules/index.ts';
import type { AnalyzeResult, LayerscopeConfig, SourceOption } from '#src/types.ts';

import { analyzeFiles } from './cache.ts';
import type { AnalysisCache } from './cache.ts';
import { loadEnvironment } from './environment.ts';
import { collectFiles } from './files.ts';
import { prepareNuxt } from './prepare.ts';

export interface AnalyzeOptions {
  /** Defaults to `process.cwd()`. */
  rootDir?: string;
  /** Defaults to `layerscope.config.*` in the root. */
  configFile?: string;
  /** Used instead of loading a config file. */
  config?: LayerscopeConfig;
  /** Run `nuxi prepare` before reading generated files. */
  prepare?: boolean;
  /** Where symbols come from. Defaults to `auto`: the registry when present, else `.d.ts`. */
  source?: SourceOption;
  /**
   * Baseline file, relative to the root. Findings it lists are moved to `baseline.suppressed`.
   * Ignored when the file does not exist.
   */
  baseline?: string;
  /** Reuses per-file analyses across runs. Used by the DevTools tab; the CLI passes none. */
  cache?: AnalysisCache;
  /** Changes when the symbol table or config changes, which flushes `cache`. */
  envKey?: string;
}

export async function analyze(options: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const fileConfig = options.config ?? (await loadConfig(rootDir, options.configFile));
  const buildDir = resolve(rootDir, fileConfig.buildDir ?? '.nuxt');
  if (options.prepare === true) {
    prepareNuxt(rootDir);
  }
  const environment = await loadEnvironment({
    rootDir,
    buildDir,
    config: fileConfig,
    source: options.source ?? 'auto',
  });
  const { layers, env, registry, config } = environment;
  const files = await collectFiles(layers, env.ownerOf, config.ignore ?? []);
  const analyses = analyzeFiles(files, env, options.cache, options.envKey);
  const edges = analyses.flatMap(analysis => analysis.edges).toSorted(compareByPosition);
  const { findings, notes } = runRules({
    edges,
    unresolved: analyses.flatMap(analysis => analysis.unresolved),
    registry,
    ownerOf: env.ownerOf,
    config,
  });
  const result: AnalyzeResult = {
    rootDir,
    config,
    source: environment.source,
    sourceFile: environment.sourceFile,
    layers,
    files: [...files.keys()],
    edges,
    findings,
    notes: [...environment.notes, ...notes],
    symbols: env.table,
    dynamicComponentFiles: analyses
      .filter(analysis => analysis.hasDynamicComponent)
      .map(analysis => analysis.file),
  };
  return options.baseline === undefined
    ? result
    : applyBaselineFile(result, resolve(rootDir, options.baseline));
}
