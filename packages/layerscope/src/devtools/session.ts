import type { AnalyzerOptions } from './analyzer.ts';
import { Analyzer } from './analyzer.ts';
import type { LiveOptions } from './live.ts';
import { Live } from './live.ts';

/** One analyzer and the live updates on top of it; created when the tab is first opened. */
export interface Session {
  analyzer: Analyzer;
  live: Live;
}

export function createSession(options: AnalyzerOptions, liveOptions?: LiveOptions): Session {
  const analyzer = new Analyzer(options);
  const live = new Live(() => analyzer, liveOptions);
  analyzer.subscribe(snapshot => {
    live.observe(snapshot);
  });
  return { analyzer, live };
}
