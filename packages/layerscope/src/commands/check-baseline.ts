import { relative } from 'pathe';

import { analyze } from '#src/analyze/index.ts';
import {
  assertNotDirectory,
  baselineName,
  baselinePath,
  createBaseline,
  writeBaseline,
} from '#src/baseline/index.ts';
import { currentDir } from '#src/utils/fs.ts';
import { plural } from '#src/utils/strings.ts';

import type { CheckFlags } from './check.ts';
import { EXIT_CLEAN, toSource, writeNotes } from './shared.ts';

export { assertStrictFlags, reportStrict } from './check-strict.ts';

export async function updateBaseline(rootDir: string, flags: CheckFlags): Promise<number> {
  const result = await analyze({
    rootDir,
    configFile: flags.config,
    prepare: flags.prepare,
    source: toSource(flags.source),
  });
  const file = baselinePath(rootDir, baselineName(flags.baseline, result.config));
  assertNotDirectory(file);
  writeBaseline(file, createBaseline(result.findings, rootDir));
  const count = plural(result.findings.length, 'finding');
  process.stdout.write(`✔ Wrote ${count} to ${relative(currentDir(), file)}\n`);
  writeNotes(result, flags.verbose === true);
  return EXIT_CLEAN;
}
