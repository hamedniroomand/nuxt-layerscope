import { emptyResult } from '#src/analyze/empty.ts';
import { analyze } from '#src/analyze/index.ts';
import { baselineFileOf, readBaseline } from '#src/baseline/index.ts';
import { loadConfig } from '#src/config/load.ts';
import type { AnalyzeResult, LayerscopeConfig } from '#src/types.ts';

import type { CheckFlags } from './check.ts';
import { toSource } from './shared.ts';

/**
 * The config, and the baseline file that the full check reads. Each read error stops the check, so
 * a gate does not pass when it cannot read them.
 */
export async function readInputs(rootDir: string, flags: CheckFlags): Promise<LayerscopeConfig> {
  const config = await loadConfig(rootDir, flags.config);
  const baseline = baselineFileOf(flags.baseline ?? true, config, rootDir);
  if (baseline !== undefined) {
    readBaseline(baseline);
  }
  return config;
}

/**
 * The empty report of a check with nothing selected. It reads the project, so that the report
 * has its layers and rules. When the project cannot be read (no `.nuxt` yet, as in a fresh clone
 * with a pre-commit hook), nothing selected is still nothing to check: the report is empty and a
 * note says why, and the check does not fail. The config and the baseline are read before.
 */
export async function emptyReport(
  rootDir: string,
  config: LayerscopeConfig,
  flags: CheckFlags,
  notes: string[],
): Promise<AnalyzeResult> {
  try {
    const result = await analyze({
      rootDir,
      config,
      prepare: flags.prepare,
      source: toSource(flags.source),
      baseline: flags.baseline ?? true,
      only: [],
    });
    result.notes.push(...notes);
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return emptyResult(rootDir, [
      ...notes,
      `The project was not read, so the report is empty: ${reason}`,
    ]);
  }
}
