import type { Baseline } from '#src/baseline/index.ts';
import { writeBaseline } from '#src/baseline/index.ts';
import { LayerscopeError } from '#src/errors.ts';
import { writeTextFile } from '#src/utils/fs.ts';

/**
 * Writes the config, then the baseline. The config comes first. Without the baseline, `check`
 * reports the remaining findings, so nothing is hidden. A failed baseline write says that the
 * config is already written.
 */
export function writeInitFiles(
  configFile: string,
  source: string,
  baselineFile: string,
  baseline: Baseline | null,
): void {
  writeTextFile(configFile, source);
  if (baseline === null) {
    return;
  }
  try {
    writeBaseline(baselineFile, baseline);
  } catch (error) {
    throw new LayerscopeError(
      `${(error as Error).message} The config file ${configFile} is already written. Fix the cause, then run the same command again with --force.`,
      { cause: error },
    );
  }
}
