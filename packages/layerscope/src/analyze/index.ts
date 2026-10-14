import { resolve } from 'pathe';

import { applyBaselineFile, assertBaselineName } from '#src/baseline/index.ts';
import { compareByPosition } from '#src/rules/compare.ts';
import { runRules } from '#src/rules/index.ts';
import { withRootNotes, withSuggestions } from '#src/suggest/index.ts';
import type { AnalyzeResult, LayerscopeConfig, SourceOption } from '#src/types.ts';

import { analyzeProject, fileLists } from './cache.ts';
import type { AnalysisCache, EnvironmentCache } from './cache.ts';
import { collectFiles } from './files.ts';
import { loadProject, projectRoot } from './load.ts';
import { applyScope, planScan } from './scope.ts';

export interface AnalyzeOptions {
  /** Defaults to `process.cwd()`. */
  rootDir?: string;
  /** Defaults to `layerscope.config.*` in the root. */
  configFile?: string;
  /** Used instead of loading a config file. */
  config?: LayerscopeConfig;
  /**
   * Also read `nuxt.config.*`, the Nuxt `modules/` dir, files of extra auto-import and component
   * dirs, and the project files that counted files import, so that `unused` counts their uses.
   * Their edges are in `extraEdges`; the rules never see them. Default `false`.
   */
  extraFiles?: boolean;
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
  /** Run the stale check again on reused symbols. Watch mode and the MCP server set it. */
  recheckStale?: boolean;
}

export async function analyze(options: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  if (options.baseline !== undefined) {
    assertBaselineName(options.baseline);
  }
  const rootDir = projectRoot(options.rootDir);
  const environment = await loadProject({ ...options, rootDir });
  const { layers, env, registry, config, presetLayers, declaredConfig } = environment;
  // Collecting reads the file system, so the event loop gets a turn after the environment loads.
  const collected = await collectFiles(layers, env.ownerOf, config.ignore ?? []);
  const plan = planScan(options.only, collected, config, rootDir);
  const { files, scope } = plan;
  const { checked, extra } = await analyzeProject(files, { ...environment, collected }, options);
  const edges = checked.flatMap(analysis => analysis.edges).toSorted(compareByPosition);
  const ran = await runRules({
    edges,
    unresolved: checked.flatMap(analysis => analysis.unresolved),
    registry,
    ownerOf: env.ownerOf,
    config,
    layers,
    rootDir,
    // The suggestions come after the baseline, so they count the findings that `check` shows.
    suggest: false,
    presetLayers,
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
    presetLayers,
    declaredConfig,
    recordedFile: environment.recordedFile,
    extraEdges: extra.flatMap(analysis => analysis.edges),
    typeEdges: [...checked, ...extra].flatMap(analysis => analysis.typeEdges),
    ...fileLists([...checked, ...extra]),
  };
  const reported =
    options.baseline === undefined
      ? result
      : applyBaselineFile(result, resolve(rootDir, options.baseline), scope?.hasRelative);
  return scope === undefined ? withSuggestions(reported) : reported;
}

/** `analyze` for the commands and tools that report findings. They add the root notes. */
export async function analyzeReport(options: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  return withRootNotes(await analyze(options));
}
