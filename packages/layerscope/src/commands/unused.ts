import { resolve } from 'pathe';

import { analyze } from '#src/analyze/index.ts';
import { LayerscopeError } from '#src/errors.ts';
import { formatUnused, isUnusedFormat, UNUSED_FORMATS } from '#src/report/unused.ts';
import { findUnused } from '#src/unused/index.ts';

import type { Cli, CommonFlags } from './shared.ts';
import { EXIT_CLEAN, toSource, withCommonOptions, writeNotes } from './shared.ts';

export async function unused(root: string | undefined, flags: CommonFlags): Promise<number> {
  const { format } = flags;
  if (!isUnusedFormat(format)) {
    throw new LayerscopeError(`Unknown format "${format}". Use ${UNUSED_FORMATS.join(', ')}.`);
  }
  const result = await analyze({
    rootDir: resolve(root ?? process.cwd()),
    configFile: flags.config,
    prepare: flags.prepare,
    source: toSource(flags.source),
  });
  process.stdout.write(formatUnused(findUnused(result), format));
  writeNotes(result, flags.verbose === true);
  return EXIT_CLEAN;
}

export function registerUnused(cli: Cli): void {
  withCommonOptions(
    cli
      .command('unused [root]', 'List components and auto-imports nothing references')
      .option('--format <format>', `Output format: ${UNUSED_FORMATS.join(', ')}`, {
        default: 'text',
      }),
  ).action(unused);
}
