import { resolve } from 'pathe';

import { analyze } from '#src/analyze/index.ts';
import { LayerscopeError } from '#src/errors.ts';
import { formatWhy, isWhyFormat, WHY_FORMATS } from '#src/report/why.ts';
import { findUses } from '#src/why/index.ts';

import type { Cli, CommonFlags } from './shared.ts';
import { EXIT_CLEAN, toSource, withCommonOptions, writeNotes } from './shared.ts';

export async function why(
  symbol: string,
  root: string | undefined,
  flags: CommonFlags,
): Promise<number> {
  const { format } = flags;
  if (!isWhyFormat(format)) {
    throw new LayerscopeError(`Unknown format "${format}". Use ${WHY_FORMATS.join(', ')}.`);
  }
  const rootDir = resolve(root ?? process.cwd());
  const result = await analyze({
    rootDir,
    configFile: flags.config,
    prepare: flags.prepare,
    source: toSource(flags.source),
  });
  writeNotes(result, flags.verbose === true);
  const targets = findUses(result, symbol, result.config);
  if (targets.length === 0) {
    throw new LayerscopeError(`No uses of "${symbol}" found.`);
  }
  process.stdout.write(formatWhy(symbol, targets, format));
  return EXIT_CLEAN;
}

export function registerWhy(cli: Cli): void {
  withCommonOptions(
    cli
      .command('why <symbol> [root]', 'List every use of a symbol and the layers it crosses')
      .option('--format <format>', `Output format: ${WHY_FORMATS.join(', ')}`, { default: 'text' }),
  ).action(why);
}
