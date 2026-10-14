import { analyze } from '#src/analyze/index.ts';
import type { AnalyzeOptions } from '#src/analyze/index.ts';
import {
  baselineName,
  baselinePath,
  baselineSize,
  createBaseline,
  diffBaselines,
  readBaseline,
} from '#src/baseline/index.ts';
import type { Baseline } from '#src/baseline/index.ts';
import { loadConfig } from '#src/config/load.ts';
import { ruleSeverity } from '#src/config/rules.ts';
import type { BaselineEntry, LayerscopeConfig } from '#src/types.ts';

import { baselineAt } from './git.ts';

export interface Drift {
  base: string;
  added: BaselineEntry[];
  fixed: BaselineEntry[];
  /** All the entries of the baseline on the base ref and in the working tree, warnings too. */
  baselineSize: { base: number; current: number };
}

/**
 * Keeps only the entries of rules that `config` sets to `error`. `drift` uses the current config
 * for the base baseline and for the findings now. So a rule that a change moves from `warn` to
 * `error` counts on both sides.
 */
function errorsOnly(baseline: Baseline, config: LayerscopeConfig): Baseline {
  return {
    ...baseline,
    entries: baseline.entries.filter(entry => ruleSeverity(config, entry.rule) === 'error'),
  };
}

/**
 * Compares the errors in the code as it is now with the baseline committed on `base`. Only rules
 * that the config sets to `error` count. Nothing is stored. Without `baselineOption`, the config
 * in the working tree names the baseline file, on `base` too. The config is loaded before the git
 * read, so a bad ref still stops the run before the analysis.
 */
export async function measureDrift(
  options: AnalyzeOptions & { rootDir: string },
  base: string,
  baselineOption?: string,
): Promise<Drift> {
  const config =
    baselineOption === undefined
      ? (options.config ?? (await loadConfig(options.rootDir, options.configFile)))
      : {};
  const baselineFile = baselineName(baselineOption, config);
  const before = baselineAt(options.rootDir, base, baselineFile);
  const result = await analyze({ ...options, baseline: undefined });
  const now = createBaseline(result.findings, options.rootDir);
  const committed = readBaseline(baselinePath(options.rootDir, baselineFile))?.entries ?? [];
  return {
    base,
    ...diffBaselines(errorsOnly(before, result.config), errorsOnly(now, result.config)),
    baselineSize: { base: baselineSize(before.entries), current: baselineSize(committed) },
  };
}
