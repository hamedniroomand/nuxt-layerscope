import { relative, resolve } from 'pathe';

import { analyze } from '#src/analyze/index.ts';
import { createBaseline, writeBaseline } from '#src/baseline/index.ts';
import { plural } from '#src/utils/strings.ts';

import type { CheckFlags } from './check.ts';
import { EXIT_CLEAN, toSource, writeNotes } from './shared.ts';

export async function updateBaseline(rootDir: string, flags: CheckFlags): Promise<number> {
  const result = await analyze({
    rootDir,
    configFile: flags.config,
    prepare: flags.prepare,
    source: toSource(flags.source),
  });
  const file = resolve(rootDir, flags.baseline);
  writeBaseline(file, createBaseline(result.findings, rootDir));
  const count = plural(result.findings.length, 'finding');
  process.stdout.write(`✔ Wrote ${count} to ${relative(process.cwd(), file)}\n`);
  writeNotes(result, flags.verbose === true);
  return EXIT_CLEAN;
}
