import { statSync } from 'node:fs';

import type { Layer } from '#src/types.ts';

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

  public get size(): number {
    return this.entries.size;
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

/** Analyzes every file, reusing `cache` entries that are still current. */
export function analyzeFiles(
  files: Map<string, Layer>,
  env: AnalysisEnv,
  cache?: AnalysisCache,
  envKey = '',
): FileAnalysis[] {
  // Whether an import resolves depends on which files exist, so adding or removing one flushes.
  cache?.reset(`${envKey}\0${[...files.keys()].toSorted().join('\0')}`);
  const analyses = [...files].map(([file, layer]) =>
    cache === undefined
      ? analyzeFile(file, layer, env)
      : cache.get(file, () => analyzeFile(file, layer, env)),
  );
  cache?.retain(files.keys());
  return analyses;
}
