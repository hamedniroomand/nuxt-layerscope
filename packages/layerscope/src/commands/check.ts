import { relative, resolve } from 'pathe';

import { analyze } from '#src/analyze/index.ts';
import { BASELINE_FILE, createBaseline, writeBaseline } from '#src/baseline/index.ts';
import { LayerscopeError } from '#src/errors.ts';
import { formatResult, isOutputFormat, OUTPUT_FORMATS } from '#src/report/index.ts';
import { plural } from '#src/utils/strings.ts';

import type { Cli, CommonFlags } from './shared.ts';
import { EXIT_CLEAN, EXIT_VIOLATIONS, toSource, withCommonOptions, writeNotes } from './shared.ts';

export interface CheckFlags extends CommonFlags {
  baseline: string;
  updateBaseline?: boolean;
}

async function updateBaseline(rootDir: string, flags: CheckFlags): Promise<number> {
  const result = await analyze({
    rootDir,
    configFile: flags.config,
    prepare: flags.prepare,
    source: toSource(flags.source),
  });
  writeNotes(result, flags.verbose === true);
  const file = resolve(rootDir, flags.baseline);
  writeBaseline(file, createBaseline(result.findings, rootDir));
  const count = plural(result.findings.length, 'finding');
  process.stdout.write(`✔ Wrote ${count} to ${relative(process.cwd(), file)}\n`);
  return EXIT_CLEAN;
}

export async function check(root: string | undefined, flags: CheckFlags): Promise<number> {
  const { format } = flags;
  if (!isOutputFormat(format)) {
    throw new LayerscopeError(`Unknown format "${format}". Use ${OUTPUT_FORMATS.join(', ')}.`);
  }
  const rootDir = resolve(root ?? process.cwd());
  if (flags.updateBaseline === true) {
    return updateBaseline(rootDir, flags);
  }
  const result = await analyze({
    rootDir,
    configFile: flags.config,
    prepare: flags.prepare,
    source: toSource(flags.source),
    baseline: flags.baseline,
  });
  writeNotes(result, flags.verbose === true);
  process.stdout.write(formatResult(result, format));
  // Only findings missing from the baseline fail the check.
  return result.findings.some(finding => finding.severity === 'error')
    ? EXIT_VIOLATIONS
    : EXIT_CLEAN;
}

export function registerCheck(cli: Cli): void {
  withCommonOptions(
    cli
      .command('check [root]', 'Check layer boundaries, including auto-imports')
      .option('--format <format>', `Output format: ${OUTPUT_FORMATS.join(', ')}`, {
        default: 'text',
      })
      .option('--baseline <file>', 'Findings to accept, relative to the root', {
        default: BASELINE_FILE,
      })
      .option('--update-baseline', 'Write every current finding to the baseline file'),
  ).action(check);
}
