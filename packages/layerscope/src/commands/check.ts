import { relative, resolve } from 'pathe';

import { analyze } from '#src/analyze/index.ts';
import { BASELINE_FILE, createBaseline, writeBaseline } from '#src/baseline/index.ts';
import { LayerscopeError } from '#src/errors.ts';
import { formatResult, isOutputFormat, OUTPUT_FORMATS } from '#src/report/index.ts';
import type { OutputFormat } from '#src/report/index.ts';
import { repoRoot } from '#src/report/paths.ts';
import { plural } from '#src/utils/strings.ts';
import { paintFor } from '#src/utils/style.ts';

import type { Cli, CommonFlags } from './shared.ts';
import { EXIT_CLEAN, EXIT_VIOLATIONS, toSource, withCommonOptions, writeNotes } from './shared.ts';

export interface CheckFlags extends CommonFlags {
  baseline: string;
  updateBaseline?: boolean;
  watch?: boolean;
}

async function updateBaseline(rootDir: string, flags: CheckFlags): Promise<number> {
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

async function watch(rootDir: string, format: OutputFormat, flags: CheckFlags): Promise<number> {
  // Loaded here, so a one-shot check does not load the watch code.
  const { watchCheck } = await import('#src/watch/index.ts');
  const abort = new AbortController();
  const stop = (): void => {
    abort.abort();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const paint = paintFor(process.stdout);
  const repository = format === 'sarif' || format === 'gitlab' ? repoRoot(rootDir) : rootDir;
  try {
    return await watchCheck({
      rootDir,
      configFile: flags.config,
      source: toSource(flags.source),
      baseline: flags.baseline,
      prepare: flags.prepare === true,
      render: result => formatResult(result, format, process.cwd(), paint, repository),
      human: format === 'text' || format === 'github',
      tty: process.stdout.isTTY,
      write: text => {
        process.stdout.write(text);
      },
      warn: text => {
        process.stderr.write(text);
      },
      signal: abort.signal,
    });
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

export async function check(root: string | undefined, flags: CheckFlags): Promise<number> {
  const { format } = flags;
  if (!isOutputFormat(format)) {
    throw new LayerscopeError(`Unknown format "${format}". Use ${OUTPUT_FORMATS.join(', ')}.`);
  }
  if (flags.watch === true && flags.updateBaseline === true) {
    throw new LayerscopeError('--watch cannot be used with --update-baseline.');
  }
  const rootDir = resolve(root ?? process.cwd());
  if (flags.updateBaseline === true) {
    return updateBaseline(rootDir, flags);
  }
  if (flags.watch === true) {
    return watch(rootDir, format, flags);
  }
  const result = await analyze({
    rootDir,
    configFile: flags.config,
    prepare: flags.prepare,
    source: toSource(flags.source),
    baseline: flags.baseline,
  });
  // Only `sarif` and `gitlab` read the repository root; the others do not run git.
  const repository = format === 'sarif' || format === 'gitlab' ? repoRoot(rootDir) : rootDir;
  process.stdout.write(
    formatResult(result, format, process.cwd(), paintFor(process.stdout), repository),
  );
  writeNotes(result, flags.verbose === true);
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
      .option('--update-baseline', 'Write every current finding to the baseline file')
      .option('--watch', 'Check again after each change, until Ctrl+C'),
  ).action(check);
}
