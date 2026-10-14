import { analyzeReport } from '#src/analyze/index.ts';
import { assertBaselineOption } from '#src/baseline/index.ts';
import { LayerscopeError } from '#src/errors.ts';
import { prepareApply, realIo, runApply } from '#src/fix/apply.ts';
import { countBaselineEntries, countOtherFindings, planMoves } from '#src/fix/plan.ts';
import { formatApplied, formatStopped } from '#src/report/applied.ts';
import { formatMoves } from '#src/report/moves.ts';
import { projectRoot, currentDir } from '#src/utils/fs.ts';

import type { Cli, CommonFlags } from './shared.ts';
import { EXIT_CLEAN, EXIT_ERROR, toSource, withCommonOptions, writeNotes } from './shared.ts';

export interface FixFlags extends CommonFlags {
  baseline?: string;
  dryRun?: boolean;
  apply?: boolean;
  allowDirty?: boolean;
}

export async function fix(root: string | undefined, flags: FixFlags): Promise<number> {
  assertBaselineOption(flags.baseline);
  if (flags.dryRun === true && flags.apply === true) {
    throw new LayerscopeError('Use --dry-run or --apply, not both.');
  }
  if (flags.dryRun !== true && flags.apply !== true) {
    throw new LayerscopeError(
      'fix needs --dry-run or --apply. --dry-run prints the moves. --apply makes them.',
    );
  }
  if (flags.allowDirty === true && flags.apply !== true) {
    throw new LayerscopeError('--allow-dirty works only with --apply.');
  }
  const rootDir = projectRoot(root);
  const result = await analyzeReport({
    rootDir,
    configFile: flags.config,
    prepare: flags.prepare,
    source: toSource(flags.source),
    baseline: flags.baseline ?? true,
  });
  const moves = planMoves(result);
  const notes = {
    others: countOtherFindings(result, moves),
    baselineEntries: countBaselineEntries(result, moves),
    typeImportsIgnored: result.config.typeImports === 'ignore',
  };
  const cwd = currentDir();
  if (flags.apply !== true || moves.length === 0) {
    process.stdout.write(formatMoves(moves, cwd, notes));
    writeNotes(result, flags.verbose === true);
    return EXIT_CLEAN;
  }
  const prepared = prepareApply(moves, rootDir, { allowDirty: flags.allowDirty === true, cwd });
  const applied = runApply(prepared, realIo(rootDir));
  if (applied.failure !== null) {
    process.stderr.write(formatStopped(applied, prepared, cwd));
    return EXIT_ERROR;
  }
  process.stdout.write(formatApplied(prepared, cwd, notes));
  writeNotes(result, flags.verbose === true);
  return EXIT_CLEAN;
}

export function registerFix(cli: Cli): void {
  withCommonOptions(
    cli
      .command(
        'fix [root]',
        'Print or make the file moves that fix boundary findings (only moves, no other suggestions)',
      )
      .option(
        '--baseline <file>',
        'Findings to accept, relative to the root. Default: the "baseline" key of the config, else layerscope-baseline.json',
      )
      .option('--dry-run', 'Print the planned moves and change nothing')
      .option('--apply', 'Make the planned moves and rewrite the relative imports')
      .option(
        '--allow-dirty',
        'With --apply: skip the git checks (repository, clean tree, tracked files, submodules)',
      ),
  ).action(fix);
}
