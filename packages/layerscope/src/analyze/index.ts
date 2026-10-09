import { resolve } from 'pathe';

import { applyBaselineFile } from '#src/baseline/index.ts';
import { compareByPosition } from '#src/rules/compare.ts';
import { runRules } from '#src/rules/index.ts';
import type { AnalyzeResult, LayerscopeConfig, SourceOption } from '#src/types.ts';

import { analyzeFiles } from './cache.ts';
import type { AnalysisCache, EnvironmentCache } from './cache.ts';
import { collectFiles } from './files.ts';
import { loadProject } from './load.ts';
import { applyScope, planScan } from './scope.ts';

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
  /**
   * Report only the findings in these files (absolute paths), and scan only them, so a check of a
   * few files is fast. The environment still loads for the whole project. With the `layer-cycle`
   * rule on, every file is scanned, since a cycle needs every edge; the report is filtered.
   */
  only?: string[];
  /** Reuses per-file analyses across runs. Used by the DevTools tab; the CLI passes none. */
  cache?: AnalysisCache;
  /** Changes when the symbol table or config changes, which flushes `cache` and `environment`. */
  envKey?: string;
  /** Reuses the loaded layers and symbols while `envKey` holds. Used by the DevTools tab. */
  environment?: EnvironmentCache;
}

export async function analyze(options: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const environment = await loadProject({ ...options, rootDir });
  const { layers, env, registry, config } = environment;
  // Collecting reads the file system, so the event loop gets a turn after the environment loads.
  const collected = await collectFiles(layers, env.ownerOf, config.ignore ?? []);
  const plan = planScan(options.only, collected, config, rootDir);
  const { files, scope } = plan;
  const analyses = await analyzeFiles(files, env, options.cache, options.envKey);
  const edges = analyses.flatMap(analysis => analysis.edges).toSorted(compareByPosition);
  const ran = await runRules({
    edges,
    unresolved: analyses.flatMap(analysis => analysis.unresolved),
    registry,
    ownerOf: env.ownerOf,
    config,
    layers,
    rootDir,
    suggest: scope === undefined,
  });
  const { findings, notes } = applyScope(plan, ran, collected.size);
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
    : applyBaselineFile(result, resolve(rootDir, options.baseline), scope?.hasRelative);
}
