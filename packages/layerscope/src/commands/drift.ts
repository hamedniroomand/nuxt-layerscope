import { resolve } from 'pathe';

import { BASELINE_FILE } from '#src/baseline/index.ts';
import { measureDrift } from '#src/drift/index.ts';
import { LayerscopeError } from '#src/errors.ts';
import { DRIFT_FORMATS, formatDrift, isDriftFormat } from '#src/report/drift.ts';

import type { Cli, CommonFlags } from './shared.ts';
import { EXIT_CLEAN, toSource, withCommonOptions } from './shared.ts';

export interface DriftFlags extends CommonFlags {
  base: string;
  baseline: string;
}

export async function drift(root: string | undefined, flags: DriftFlags): Promise<number> {
  const { format } = flags;
  if (!isDriftFormat(format)) {
    throw new LayerscopeError(`Unknown format "${format}". Use ${DRIFT_FORMATS.join(', ')}.`);
  }
  const result = await measureDrift(
    {
      rootDir: resolve(root ?? process.cwd()),
      configFile: flags.config,
      prepare: flags.prepare,
      source: toSource(flags.source),
    },
    flags.base,
    flags.baseline,
  );
  process.stdout.write(formatDrift(result, format));
  return EXIT_CLEAN;
}

export function registerDrift(cli: Cli): void {
  withCommonOptions(
    cli
      .command('drift [root]', 'Say how many violations the code adds and fixes against a git ref')
      .option('--base <ref>', 'Git ref whose baseline is compared', { default: 'origin/main' })
      .option('--format <format>', `Output format: ${DRIFT_FORMATS.join(', ')}`, {
        default: 'text',
      })
      .option('--baseline <file>', 'Baseline file, relative to the root', {
        default: BASELINE_FILE,
      }),
  ).action(drift);
}
