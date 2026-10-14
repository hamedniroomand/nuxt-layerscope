import { statSync } from 'node:fs';

import type { SymbolTable } from '#src/nuxt/symbols.ts';
import type { AnalyzeResult, Edge, Layer, LayerscopeConfig } from '#src/types.ts';
import { realPath } from '#src/utils/fs.ts';
import { createYielder, yieldTurn } from '#src/utils/yield.ts';

import type { Environment } from './environment.ts';
import type { AnalysisEnv } from './file-analysis.ts';
import { analyzeFile, FileAnalysis } from './file-analysis.ts';
import { extraSeeds, isExtraFile } from './files.ts';

/** The files that render a dynamic component, and the files with code that is not read. */
export function fileLists(
  analyses: FileAnalysis[],
): Pick<AnalyzeResult, 'dynamicComponentFiles' | 'unreadFiles'> {
  return {
    dynamicComponentFiles: analyses
      .filter(analysis => analysis.hasDynamicComponent)
      .map(analysis => analysis.file),
    unreadFiles: analyses.flatMap(analysis =>
      analysis.unread === null ? [] : [{ file: analysis.file, reason: analysis.unread }],
    ),
  };
}

interface Entry {
  mtimeMs: number;
  size: number;
  analysis: FileAnalysis;
}

/**
 * Keeps one file's analysis until its mtime or size changes. Analyses depend on the symbol table,
 * so a changed `envKey` (registry, generated types, config) drops everything.
 */
export class AnalysisCache {
  private envKey = '';
  private readonly entries = new Map<string, Entry>();
  private computed = 0;

  public get size(): number {
    return this.entries.size;
  }

  /** How often a file was analyzed instead of read from the cache; tests use it. */
  public get misses(): number {
    return this.computed;
  }

  public reset(envKey: string): void {
    if (envKey !== this.envKey) {
      this.envKey = envKey;
      this.entries.clear();
    }
  }

  public get(file: string, compute: () => FileAnalysis): FileAnalysis {
    const { mtimeMs, size } = statSync(file);
    const entry = this.entries.get(file);
    if (entry?.mtimeMs === mtimeMs && entry.size === size) {
      return entry.analysis;
    }
    this.computed += 1;
    const analysis = compute();
    this.entries.set(file, { mtimeMs, size, analysis });
    return analysis;
  }

  public retain(files: Iterable<string>): void {
    const keep = new Set(files);
    for (const file of this.entries.keys()) {
      if (!keep.has(file)) {
        this.entries.delete(file);
      }
    }
  }
}

/**
 * Analyzes every file, reusing `cache` entries that are still current. Yields to the event loop
 * between batches and once at the end, so a dev server stays responsive while a large project
 * is analyzed.
 */
export async function analyzeFiles(
  files: Map<string, Layer>,
  env: AnalysisEnv,
  cache?: AnalysisCache,
  envKey = '',
  pause: () => Promise<void> = createYielder(),
): Promise<FileAnalysis[]> {
  // Whether an import resolves depends on which files exist, so adding or removing one flushes.
  cache?.reset(`${envKey}\0${[...files.keys()].toSorted().join('\0')}`);
  const analyses: FileAnalysis[] = [];
  for (const [file, layer] of files) {
    analyses.push(
      cache === undefined
        ? analyzeFile(file, layer, env)
        : cache.get(file, () => analyzeFile(file, layer, env)),
    );
    // Sequential on purpose: each batch runs, then the event loop gets a turn.
    // eslint-disable-next-line no-await-in-loop -- yields between batches of files
    await pause();
  }
  cache?.retain(files.keys());
  // One more turn, so the rules that run next start a task of their own.
  await yieldTurn();
  return analyses;
}

interface ExtraInput {
  layers: Layer[];
  ignore: string[];
  /** The files that the rules check. */
  collected: Map<string, Layer>;
  /** The edges of the collected files. */
  edges: Edge[];
  env: AnalysisEnv;
}

/** The edges of a file that lead to other files: the uses that the rules see and the type uses. */
function usesOf(analysis: FileAnalysis): Edge[] {
  return [...analysis.edges, ...analysis.typeEdges];
}

/** A file that could not be read: it counts as unread, and it never stops the run. */
function unreadStub(file: string, layer: Layer, env: AnalysisEnv, reason: string): FileAnalysis {
  const analysis = new FileAnalysis(file, '', layer, env);
  analysis.unread = reason;
  return analysis;
}

function failedAnalysis(
  file: string,
  layer: Layer,
  env: AnalysisEnv,
  error: unknown,
): FileAnalysis {
  // The code of a file system error, such as EACCES; any other error shows its message.
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : String(error);
  const cause = typeof code === 'string' ? code : message.split('\n')[0];
  return unreadStub(file, layer, env, `Could not read file (${cause})`);
}

/** Reads an extra file. A file that is gone is skipped; any other error makes it unread. */
export function analyzeOrFail(file: string, layer: Layer, env: AnalysisEnv): FileAnalysis | null {
  try {
    return analyzeFile(file, layer, env, true);
  } catch (error) {
    return (error as { code?: unknown } | null)?.code === 'ENOENT'
      ? null
      : failedAnalysis(file, layer, env, error);
  }
}

function symbolFilesOf(symbols: SymbolTable): string[] {
  const files = new Set<string>();
  const targets = [
    ...[...symbols.components.values()].flat(),
    ...Object.values(symbols.imports).flatMap(map => Array.from(map.values())),
  ];
  for (const { file } of targets) {
    if (file !== null) {
      files.add(file);
    }
  }
  return [...files];
}

/**
 * Analyzes the project files that the rules do not check but that can use a symbol, for `unused`:
 * `nuxt.config.*`, local modules, files of extra auto-import and component dirs, and the project
 * files that any analyzed file imports. A file is analyzed once, so an import cycle ends. These
 * results are never checked: the caller keeps only their edges. A file that cannot be read is
 * recorded as unread.
 */
async function analyzeExtraFiles(input: ExtraInput): Promise<FileAnalysis[]> {
  const { collected, ignore, env } = input;
  const { ownerOf, table } = env;
  // Compared by real path: a symbol file has its real path, and a collected file can be a link.
  const known = new Set([...collected.keys()].map(file => realPath(file)));
  const seeds = await extraSeeds(input.layers, ownerOf, symbolFilesOf(table));
  const pending = new Set(seeds.files.map(file => realPath(file)));
  const queue = (edges: Edge[]): void => {
    for (const edge of edges) {
      if (edge.to !== null) {
        pending.add(realPath(edge.to));
      }
    }
  };
  queue(input.edges);
  const analyses: FileAnalysis[] = seeds.denied.map(item =>
    unreadStub(item.dir, item.layer, env, `Could not read dir (${item.cause})`),
  );
  const pause = createYielder();
  // The set grows while it is read, so the imports of an extra file are read in this loop too.
  for (const file of pending) {
    const layer = isExtraFile(file, ownerOf, ignore, known);
    const analysis = layer === null ? null : analyzeOrFail(file, layer, env);
    if (analysis !== null) {
      analyses.push(analysis);
      queue(usesOf(analysis));
      // eslint-disable-next-line no-await-in-loop -- yields between files
      await pause();
    }
  }
  return analyses;
}

/**
 * Analyzes the files that the rules check, and then, with `extraFiles`, the extra files that only
 * `unused` reads. A run limited to some files (`only`) does not look for more.
 */
export async function analyzeProject(
  files: Map<string, Layer>,
  project: {
    layers: Layer[];
    env: AnalysisEnv;
    config: LayerscopeConfig;
    collected: Map<string, Layer>;
  },
  options: { only?: string[]; cache?: AnalysisCache; envKey?: string; extraFiles?: boolean },
): Promise<{ checked: FileAnalysis[]; extra: FileAnalysis[] }> {
  const { layers, env, config, collected } = project;
  const checked = await analyzeFiles(files, env, options.cache, options.envKey);
  const edges = checked.flatMap(analysis => usesOf(analysis));
  const ignore = config.ignore ?? [];
  const extra =
    options.extraFiles === true && options.only === undefined
      ? await analyzeExtraFiles({ layers, ignore, collected, edges, env })
      : [];
  return { checked, extra };
}

/** Keeps the last environment while its key holds. */
export interface EnvironmentCache {
  get: (key: string, load: () => Promise<Environment>) => Promise<Environment>;
}

/**
 * Loading the environment parses the registry or the `.d.ts` files, the slowest step of a warm
 * run; the DevTools tab keeps it while the files it reads stay the same.
 */
export function createEnvironmentCache(): EnvironmentCache {
  let last: { key: string; environment: Environment } | undefined;
  return {
    get: async (key, load) => {
      if (last?.key === key) {
        return last.environment;
      }
      // A failed load leaves the cache as it was, so the next run tries again.
      const environment = await load();
      last = { key, environment };
      return environment;
    },
  };
}
