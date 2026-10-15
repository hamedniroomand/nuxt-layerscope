import { relative } from 'pathe';

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
import { realPath } from '#src/utils/fs.ts';

import { baselineAt, renamesSince } from './git.ts';
import { mapToBase } from './renames.ts';

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
  const renames = renamesSince(options.rootDir, base);
  // A renamed baseline file is read at its old path on the base.
  const file = baselinePath(options.rootDir, baselineFile);
  const oldName = renames.get(relative(realPath(options.rootDir), realPath(file)));
  const before = baselineAt(options.rootDir, base, oldName ?? baselineFile);
  const result = await analyze({ ...options, baseline: undefined });
  const mapped = mapToBase(result.findings, renames, options.rootDir);
  const now = createBaseline(mapped.findings, options.rootDir);
  const committed = readBaseline(file)?.entries ?? [];
  const { added, fixed } = diffBaselines(
    errorsOnly(before, result.config),
    errorsOnly(now, result.config),
  );
  return {
    base,
    added: added.map(entry => mapped.today(entry)),
    fixed,
    baselineSize: { base: baselineSize(before.entries), current: baselineSize(committed) },
  };
}
