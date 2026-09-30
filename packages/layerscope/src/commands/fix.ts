import { resolve } from 'pathe';

import { analyze } from '#src/analyze/index.ts';
import { LayerscopeError } from '#src/errors.ts';
import { planMoves } from '#src/fix/plan.ts';
import { formatMoves } from '#src/report/moves.ts';

import type { Cli, CommonFlags } from './shared.ts';
import { EXIT_CLEAN, toSource, withCommonOptions, writeNotes } from './shared.ts';

export interface FixFlags extends CommonFlags {
  dryRun?: boolean;
}

export async function fix(root: string | undefined, flags: FixFlags): Promise<number> {
  if (flags.dryRun !== true) {
    throw new LayerscopeError('fix only supports --dry-run for now: it never moves files.');
  }
  const result = await analyze({
    rootDir: resolve(root ?? process.cwd()),
    configFile: flags.config,
    prepare: flags.prepare,
    source: toSource(flags.source),
  });
  process.stdout.write(formatMoves(planMoves(result), process.cwd()));
  writeNotes(result, flags.verbose === true);
  return EXIT_CLEAN;
}

export function registerFix(cli: Cli): void {
  withCommonOptions(
    cli
      .command('fix [root]', 'Print the file moves that would fix boundary findings')
      .option('--dry-run', 'Print the planned moves; required, nothing is applied yet'),
  ).action(fix);
}
