import { analyzeReport } from '#src/analyze/index.ts';
import { assertBaselineOption } from '#src/baseline/index.ts';
import { LayerscopeError } from '#src/errors.ts';
import { formatResult, isOutputFormat, OUTPUT_FORMATS } from '#src/report/index.ts';
import type { OutputFormat } from '#src/report/index.ts';
import { repoRoot } from '#src/report/paths.ts';
import { paintFor } from '#src/utils/style.ts';

import { assertStrictFlags, baselineRun, reportStrict, updateBaseline } from './check-baseline.ts';
import { deletedNote, selectTarget, splitArguments } from './check-files.ts';
import { checkNothing } from './check-nothing.ts';
import type { Cli, CommonFlags } from './shared.ts';
import {
  currentDir,
  EXIT_CLEAN,
  EXIT_VIOLATIONS,
  projectRoot,
  toSource,
  withCommonOptions,
  prepareSummary,
  writeNotes,
  writeSummary,
} from './shared.ts';

export interface CheckFlags extends CommonFlags {
  baseline?: string;
  updateBaseline?: boolean;
  strictBaseline?: boolean;
  watch?: boolean;
  staged?: boolean;
  changed?: boolean;
  since?: string;
  summary?: string | boolean;
}

async function watch(
  rootDir: string,
  format: OutputFormat,
  flags: CheckFlags,
  run: ReturnType<typeof baselineRun>,
): Promise<number> {
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
      render: result => formatResult(result, format, currentDir(), paint, repository, run),
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

export async function check(
  root: string | undefined,
  files: string[],
  flags: CheckFlags,
): Promise<number> {
  assertBaselineOption(flags.baseline);
  const { format } = flags;
  if (!isOutputFormat(format)) {
    throw new LayerscopeError(`Unknown format "${format}". Use ${OUTPUT_FORMATS.join(', ')}.`);
  }
  await prepareSummary(flags.summary, format, flags, projectRoot(splitArguments(root, files).root));
  if (flags.watch === true && flags.updateBaseline === true) {
    throw new LayerscopeError('--watch cannot be used with --update-baseline.');
  }
  assertStrictFlags(flags);
  const { rootDir, selection } = selectTarget(root, files, flags);
  if (flags.updateBaseline === true) {
    return updateBaseline(rootDir, flags);
  }
  const run = baselineRun(splitArguments(root, files).root, flags);
  if (flags.watch === true) {
    return watch(rootDir, format, flags, run);
  }
  if (selection?.files.length === 0) {
    return checkNothing(rootDir, selection, format, flags);
  }
  const result = await analyzeReport({
    rootDir,
    configFile: flags.config,
    prepare: flags.prepare,
    source: toSource(flags.source),
    baseline: flags.baseline ?? true,
    ...(selection === undefined ? {} : { only: selection.files }),
  });
  const deleted = selection === undefined ? null : deletedNote(selection);
  if (deleted !== null) {
    result.notes.push(deleted);
  }
  // Only `sarif` and `gitlab` read the repository root; the others do not run git.
  const repository = format === 'sarif' || format === 'gitlab' ? repoRoot(rootDir) : rootDir;
  const paint = paintFor(process.stdout);
  process.stdout.write(formatResult(result, format, currentDir(), paint, repository, run));
  const stale = reportStrict(result, splitArguments(root, files).root, flags);
  writeSummary(flags.summary, result.findings, stale.summary);
  writeNotes(result, flags.verbose === true);
  // Findings missing from the baseline fail the check, and with --strict-baseline fixed entries too.
  return result.findings.some(finding => finding.severity === 'error') || stale.failed
    ? EXIT_VIOLATIONS
    : EXIT_CLEAN;
}

export function registerCheck(cli: Cli): void {
  withCommonOptions(
    cli
      .command('check [root] [...files]', 'Check layer boundaries, including auto-imports')
      .option('--format <format>', `Output format: ${OUTPUT_FORMATS.join(', ')}`, {
        default: 'text',
      })
      .option(
        '--baseline <file>',
        'Findings to accept, relative to the root. Default: the "baseline" key of the config, else layerscope-baseline.json',
      )
      .option('--update-baseline', 'Write every current finding to the baseline file')
      .option(
        '--strict-baseline',
        'Fail when the baseline has fixed entries, so that they are removed',
      )
      .option('--staged', 'Check only the files staged for commit')
      .option('--changed', 'Check only the files that changed since the default branch')
      .option(
        '--since <ref>',
        'Check only the files that changed since the merge base with a git ref (implies --changed)',
      )
      .option('--watch', 'Check again after each change, until Ctrl+C')
      .option(
        '--summary <file>',
        'Write the count and the list of the findings to a file, as Markdown (only with --format github)',
      ),
  ).action(check);
}
