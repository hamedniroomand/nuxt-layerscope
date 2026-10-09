import { statSync } from 'node:fs';

import type { Layer } from '#src/types.ts';
import { createYielder, yieldTurn } from '#src/utils/yield.ts';

import type { Environment } from './environment.ts';
import type { AnalysisEnv, FileAnalysis } from './file-analysis.ts';
import { analyzeFile } from './file-analysis.ts';

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
