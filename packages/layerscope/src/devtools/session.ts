import type { AnalyzerOptions } from './analyzer.ts';
import { Analyzer } from './analyzer.ts';
import { createToken } from './csrf.ts';
import type { LiveOptions } from './live.ts';
import { Live } from './live.ts';
import type { Writes } from './writes.ts';
import { createWrites } from './writes.ts';

/** One analyzer and the live updates on top of it; created when the tab is first opened. */
export interface Session {
  analyzer: Analyzer;
  live: Live;
  writes: Writes;
  /** Required on every request that writes a file; the shell hands it to the tab. */
  token: string;
}

export function createSession(options: AnalyzerOptions, liveOptions?: LiveOptions): Session {
  const analyzer = new Analyzer(options);
  const live = new Live(() => analyzer, liveOptions);
  analyzer.subscribe(snapshot => {
    live.observe(snapshot);
  });
  return { analyzer, live, writes: createWrites(), token: createToken() };
}
