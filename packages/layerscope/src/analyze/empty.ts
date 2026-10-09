import type { AnalyzeResult } from '#src/types.ts';

/** A result without a project: no layers, no files, no findings. For a report of nothing. */
export function emptyResult(rootDir: string, notes: string[]): AnalyzeResult {
  return {
    rootDir,
    config: {},
    source: 'types',
    sourceFile: '',
    layers: [],
    files: [],
    edges: [],
    findings: [],
    notes,
    symbols: {
      imports: { app: new Map(), server: new Map(), shared: new Map() },
      components: new Map(),
    },
    dynamicComponentFiles: [],
  };
}
