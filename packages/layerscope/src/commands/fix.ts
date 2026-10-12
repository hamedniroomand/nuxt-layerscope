import { resolve } from 'pathe';

import { analyzeReport } from '#src/analyze/index.ts';
import { BASELINE_FILE } from '#src/baseline/index.ts';
import { LayerscopeError } from '#src/errors.ts';
import { countOtherFindings, planMoves } from '#src/fix/plan.ts';
import { formatMoves } from '#src/report/moves.ts';

import type { Cli, CommonFlags } from './shared.ts';
import { EXIT_CLEAN, toSource, withCommonOptions, writeNotes } from './shared.ts';

export interface FixFlags extends CommonFlags {
  baseline: string;
  dryRun?: boolean;
}

export async function fix(root: string | undefined, flags: FixFlags): Promise<number> {
  if (flags.dryRun !== true) {
    throw new LayerscopeError('fix only supports --dry-run for now: it never moves files.');
  }
  const result = await analyzeReport({
    rootDir: resolve(root ?? process.cwd()),
    configFile: flags.config,
    prepare: flags.prepare,
    source: toSource(flags.source),
    baseline: flags.baseline,
  });
  const moves = planMoves(result);
  process.stdout.write(
    formatMoves(moves, process.cwd(), {
      others: countOtherFindings(result, moves),
      typeImportsIgnored: result.config.typeImports === 'ignore',
    }),
  );
  writeNotes(result, flags.verbose === true);
  return EXIT_CLEAN;
}

export function registerFix(cli: Cli): void {
  withCommonOptions(
    cli
      .command(
        'fix [root]',
        'Print the file moves that would fix boundary findings (only moves, no other suggestions)',
      )
      .option('--baseline <file>', 'Findings to accept, relative to the root', {
        default: BASELINE_FILE,
      })
      .option('--dry-run', 'Print the planned moves; required, nothing is applied yet'),
  ).action(fix);
}
