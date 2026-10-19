import { assertBaselineOption, baselineSize } from '#src/baseline/index.ts';
import { measureDrift } from '#src/drift/index.ts';
import { LayerscopeError } from '#src/errors.ts';
import {
  DRIFT_FORMATS,
  formatDrift,
  formatGrowthMarkdown,
  growthSentence,
  isDriftFormat,
} from '#src/report/drift.ts';
import type { DriftFormat } from '#src/report/drift.ts';
import { projectRoot } from '#src/utils/fs.ts';
import { paintFor } from '#src/utils/style.ts';

import type { Cli, CommonFlags } from './shared.ts';
import { EXIT_CLEAN, EXIT_VIOLATIONS, toSource, withCommonOptions } from './shared.ts';

export interface DriftFlags extends CommonFlags {
  base: string;
  baseline?: string;
  failOnGrowth?: boolean;
}

/**
 * Says that the code has errors that the baseline at the base does not have: a red last line of
 * the text report, two more paragraphs of the markdown report, or a line on stderr for json, so
 * that its stdout stays machine-readable.
 */
function reportGrowth(count: number, base: string, format: DriftFormat): void {
  if (format === 'text') {
    const paint = paintFor(process.stdout);
    process.stdout.write(`${paint(['red', 'bold'], growthSentence(count, base, false))}\n`);
  } else if (format === 'markdown') {
    process.stdout.write(formatGrowthMarkdown(count, base));
  } else {
    process.stderr.write(`layerscope: ${growthSentence(count, base, false).slice(2)}\n`);
  }
}

export async function drift(root: string | undefined, flags: DriftFlags): Promise<number> {
  assertBaselineOption(flags.baseline);
  const { format } = flags;
  if (!isDriftFormat(format)) {
    throw new LayerscopeError(`Unknown format "${format}". Use ${DRIFT_FORMATS.join(', ')}.`);
  }
  const result = await measureDrift(
    {
      rootDir: projectRoot(root),
      configFile: flags.config,
      prepare: flags.prepare,
      source: toSource(flags.source),
    },
    flags.base,
    flags.baseline,
  );
  process.stdout.write(formatDrift(result, format));
  const paint = paintFor(process.stderr);
  for (const note of result.notes ?? []) {
    process.stderr.write(`${paint(['yellow', 'bold'], 'layerscope: note:')} ${note}\n`);
  }
  const added = baselineSize(result.added);
  if (flags.failOnGrowth !== true || added === 0) {
    return EXIT_CLEAN;
  }
  reportGrowth(added, result.base, format);
  return EXIT_VIOLATIONS;
}

export function registerDrift(cli: Cli): void {
  withCommonOptions(
    cli
      .command('drift [root]', 'Say how many errors the code adds and fixes against a git ref')
      .option('--base <ref>', 'Git ref whose baseline is compared', { default: 'origin/main' })
      .option('--format <format>', `Output format: ${DRIFT_FORMATS.join(', ')}`, {
        default: 'text',
      })
      .option(
        '--baseline <file>',
        'Baseline file, relative to the root. Default: the "baseline" key of the config, else layerscope-baseline.json',
      )
      .option(
        '--fail-on-growth',
        'Exit with 1 when the code has errors that the baseline at the base ref does not have',
      ),
  ).action(drift);
}
