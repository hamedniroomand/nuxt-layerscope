import type { Selection } from '#src/git/selection.ts';
import { formatResult } from '#src/report/index.ts';
import type { OutputFormat } from '#src/report/index.ts';
import { repoRoot } from '#src/report/paths.ts';
import { paintFor } from '#src/utils/style.ts';

import { deletedNote } from './check-files.ts';
import { emptyReport, readInputs } from './check-nothing-project.ts';
import type { CheckFlags } from './check.ts';
import { currentDir, EXIT_CLEAN } from './shared.ts';

/**
 * A check that has nothing to look at: no analysis of files, and a short message. It still reads
 * the config and the baseline, so a gate does not pass when it cannot read them.
 */
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
  const config = await readInputs(rootDir, flags);
  if (format === 'text' || format === 'github') {
    return EXIT_CLEAN;
  }
  // A machine format still gets a valid, empty document.
  const result = await emptyReport(rootDir, config, flags, deleted === null ? [] : [deleted]);
  const repository = format === 'sarif' || format === 'gitlab' ? repoRoot(rootDir) : rootDir;
  process.stdout.write(
    formatResult(result, format, currentDir(), paintFor(process.stdout), repository),
  );
  return EXIT_CLEAN;
}
