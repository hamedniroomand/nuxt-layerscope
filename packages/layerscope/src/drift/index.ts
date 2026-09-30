import { join } from 'pathe';

import { analyze } from '#src/analyze/index.ts';
import type { AnalyzeOptions } from '#src/analyze/index.ts';
import { baselineSize, createBaseline, diffBaselines, readBaseline } from '#src/baseline/index.ts';
import type { BaselineEntry } from '#src/types.ts';

import { baselineAt } from './git.ts';

export interface Drift {
  base: string;
  added: BaselineEntry[];
  fixed: BaselineEntry[];
  /** Violations the baseline accepts on the base ref and in the working tree. */
  baselineSize: { base: number; current: number };
}

/** Compares the code as it is now with the baseline committed on `base`. Nothing is stored. */
export async function measureDrift(
  options: AnalyzeOptions & { rootDir: string },
  base: string,
  baselineFile: string,
): Promise<Drift> {
  const before = baselineAt(options.rootDir, base, baselineFile);
  const result = await analyze({ ...options, baseline: undefined });
  const now = createBaseline(result.findings, options.rootDir);
  const committed = readBaseline(join(options.rootDir, baselineFile))?.entries ?? [];
  return {
    base,
    ...diffBaselines(before, now),
    baselineSize: { base: baselineSize(before.entries), current: baselineSize(committed) },
  };
}
