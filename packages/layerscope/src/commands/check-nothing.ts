import { emptyResult } from '#src/analyze/empty.ts';
import { analyze } from '#src/analyze/index.ts';
import type { Selection } from '#src/git/selection.ts';
import { formatResult } from '#src/report/index.ts';
import type { OutputFormat } from '#src/report/index.ts';
import { repoRoot } from '#src/report/paths.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { paintFor } from '#src/utils/style.ts';

import { deletedNote } from './check-files.ts';
import type { CheckFlags } from './check.ts';
import { EXIT_CLEAN, toSource } from './shared.ts';

/**
 * The empty report of a check with nothing selected. It reads the project, so that the report
 * has its layers and rules. When the project cannot be read (no `.nuxt` yet, as in a fresh clone
 * with a pre-commit hook), nothing selected is still nothing to check: the report is empty and a
 * note says why, and the check does not fail.
 */
async function emptyReport(
  rootDir: string,
  flags: CheckFlags,
  notes: string[],
): Promise<AnalyzeResult> {
  try {
    const result = await analyze({
      rootDir,
      configFile: flags.config,
      prepare: flags.prepare,
      source: toSource(flags.source),
      baseline: flags.baseline,
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

/** A check that has nothing to look at: no analysis of files, and a short message. */
export async function checkNothing(
  rootDir: string,
  selection: Selection,
  format: OutputFormat,
  flags: CheckFlags,
): Promise<number> {
  const deleted = deletedNote(selection);
  process.stderr.write(`layerscope: ${selection.none}\n`);
  if (deleted !== null) {
    process.stderr.write(`layerscope: note: ${deleted}\n`);
  }
  if (format === 'text' || format === 'github') {
    return EXIT_CLEAN;
  }
  // A machine format still gets a valid, empty document.
  const result = await emptyReport(rootDir, flags, deleted === null ? [] : [deleted]);
  const repository = format === 'sarif' || format === 'gitlab' ? repoRoot(rootDir) : rootDir;
  process.stdout.write(
    formatResult(result, format, process.cwd(), paintFor(process.stdout), repository),
  );
  return EXIT_CLEAN;
}
