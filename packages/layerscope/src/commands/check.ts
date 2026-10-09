import { analyze } from '#src/analyze/index.ts';
import { BASELINE_FILE } from '#src/baseline/index.ts';
import { LayerscopeError } from '#src/errors.ts';
import { formatResult, isOutputFormat, OUTPUT_FORMATS } from '#src/report/index.ts';
import type { OutputFormat } from '#src/report/index.ts';
import { repoRoot } from '#src/report/paths.ts';
import { paintFor } from '#src/utils/style.ts';

import { updateBaseline } from './check-baseline.ts';
import { deletedNote, selectTarget } from './check-files.ts';
import { checkNothing } from './check-nothing.ts';
import type { Cli, CommonFlags } from './shared.ts';
import { EXIT_CLEAN, EXIT_VIOLATIONS, toSource, withCommonOptions, writeNotes } from './shared.ts';

export interface CheckFlags extends CommonFlags {
  baseline: string;
  updateBaseline?: boolean;
  watch?: boolean;
  staged?: boolean;
  changed?: boolean;
  since?: string;
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

export async function check(
  root: string | undefined,
  files: string[],
  flags: CheckFlags,
): Promise<number> {
  const { format } = flags;
  if (!isOutputFormat(format)) {
    throw new LayerscopeError(`Unknown format "${format}". Use ${OUTPUT_FORMATS.join(', ')}.`);
  }
  if (flags.watch === true && flags.updateBaseline === true) {
    throw new LayerscopeError('--watch cannot be used with --update-baseline.');
  }
  const { rootDir, selection } = selectTarget(root, files, flags);
  if (flags.updateBaseline === true) {
    return updateBaseline(rootDir, flags);
  }
  if (flags.watch === true) {
    return watch(rootDir, format, flags);
  }
  if (selection?.files.length === 0) {
    return checkNothing(rootDir, selection, format, flags);
  }
  const result = await analyze({
    rootDir,
    configFile: flags.config,
    prepare: flags.prepare,
    source: toSource(flags.source),
    baseline: flags.baseline,
    ...(selection === undefined ? {} : { only: selection.files }),
  });
  const deleted = selection === undefined ? null : deletedNote(selection);
  if (deleted !== null) {
    result.notes.push(deleted);
  }
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
      .command('check [root] [...files]', 'Check layer boundaries, including auto-imports')
      .option('--format <format>', `Output format: ${OUTPUT_FORMATS.join(', ')}`, {
        default: 'text',
      })
      .option('--baseline <file>', 'Findings to accept, relative to the root', {
        default: BASELINE_FILE,
      })
      .option('--update-baseline', 'Write every current finding to the baseline file')
      .option('--staged', 'Check only the files staged for commit')
      .option('--changed', 'Check only the files that changed since the default branch')
      .option(
        '--since <ref>',
        'Check only the files that changed since the merge base with a git ref (implies --changed)',
      )
      .option('--watch', 'Check again after each change, until Ctrl+C'),
  ).action(check);
}
