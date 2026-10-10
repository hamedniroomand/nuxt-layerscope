import { analyzeReport } from '#src/analyze/index.ts';
import { Analyzer } from '#src/devtools/analyzer.ts';
import type { AnalyzerOptions } from '#src/devtools/analyzer.ts';

/** The analyzer that `watch` holds: an `Analyzer` whose runs add the root notes. */
export type WatchAnalyzer = Analyzer;

/** The watch analyzer. Its runs add the root notes; the devtools tab keeps its own runs. */
export function createWatchAnalyzer(options: AnalyzerOptions): WatchAnalyzer {
  return new Analyzer({ ...options, run: analyzeReport });
}
