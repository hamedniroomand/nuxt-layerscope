import { statSync, writeFileSync } from 'node:fs';

import type { cac } from 'cac';
import { relative, resolve } from 'pathe';

import { baselineName, baselinePath } from '#src/baseline/index.ts';
import { loadConfig } from '#src/config/load.ts';
import { LayerscopeError } from '#src/errors.ts';
import { formatFindingsSummary } from '#src/report/findings-summary.ts';
import type { AnalyzeResult, Finding, SourceOption } from '#src/types.ts';
import { currentDir } from '#src/utils/fs.ts';
import { paintFor } from '#src/utils/style.ts';

// Command files that are at the dependency limit import these from here.
export { currentDir, projectRoot } from '#src/utils/fs.ts';

export const SOURCE_OPTIONS: readonly SourceOption[] = ['auto', 'registry', 'types'];

export const EXIT_CLEAN = 0;
export const EXIT_VIOLATIONS = 1;
export const EXIT_ERROR = 2;

export interface CommonFlags {
  format: string;
  config?: string;
  prepare?: boolean;
  source: string;
  verbose?: boolean;
}

export type Cli = ReturnType<typeof cac>;

type Command = ReturnType<Cli['command']>;

export function withCommonOptions(command: Command): Command {
  return command
    .option('--config <file>', 'Path to layerscope.config.ts, relative to the root')
    .option('--prepare', 'Run "nuxi prepare" before checking')
    .option('--source <source>', `Symbol source: ${SOURCE_OPTIONS.join(', ')}`, {
      default: 'auto',
    })
    .option('--verbose', 'Print where symbols were read from');
}

export function toSource(value: string): SourceOption {
  const source = SOURCE_OPTIONS.find(option => option === value);
  if (source === undefined) {
    throw new LayerscopeError(`Unknown source "${value}". Use ${SOURCE_OPTIONS.join(', ')}.`);
  }
  return source;
}

/**
 * Diagnostics go to stderr, so stdout stays machine-readable in every format. Call it after the
 * report is written: notes at the end are the ones a reader still sees when the report scrolled.
 */
export function writeNotes(result: AnalyzeResult, verbose: boolean): void {
  const paint = paintFor(process.stderr);
  const lines = result.notes.map(
    note => `${paint(['yellow', 'bold'], 'layerscope: note:')} ${note}`,
  );
  if (verbose) {
    const kind = result.source === 'registry' ? 'the registry' : 'the generated .d.ts files';
    const source = relative(currentDir(), result.sourceFile);
    lines.unshift(paint('dim', `layerscope: symbols from ${kind} (${source})`));
  }
  if (lines.length > 0) {
    // A blank line sets the notes apart from the summary above them in a terminal.
    process.stderr.write(`${process.stdout.isTTY ? '\n' : ''}${lines.join('\n')}\n`);
  }
}

/**
 * cac gives its parser the camelCase name of a boolean flag (`dryRun`), but the parser reads the
 * argument as the user wrote it (`--dry-run`). It does not know that this is a boolean, so it takes
 * the next argument as the value, and the root argument is lost. This adds the spelling of the user
 * as one more name of each boolean flag. Then cac gives both names to its parser, for the command
 * that has the flag only, and the value of `options.dryRun` is the same as before.
 */
export function acceptDashedBooleans(cli: Cli): void {
  for (const command of [cli.globalCommand, ...cli.commands]) {
    for (const option of command.options) {
      if (option.isBoolean === true && !option.negated) {
        const written = option.rawName.split(',').map(name => name.trim().replace(/^--?/u, ''));
        option.names.push(...written.filter(name => !option.names.includes(name)));
      }
    }
  }
}

/**
 * The value of `--config`, for every command. The option parser gives a number for an empty value
 * and for a value like `007`, `true` for no value, and a list for a flag that is given more than
 * once, as for `--baseline`.
 */
export function assertConfigOption(value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    throw new LayerscopeError('--config was given more than once. Give it one time.');
  }
  if (typeof value === 'string' && value !== '') {
    return;
  }
  const hint =
    typeof value === 'number' && value !== 0
      ? ' For a file name that is a number, write it as ./<name>.'
      : '';
  throw new LayerscopeError(
    `--config needs a file name. Leave it out to use the layerscope.config.* file in the root.${hint}`,
  );
}

/**
 * The value of `--summary`. The option parser gives a number for an empty value and for a value
 * like `2024`, and a list for a flag that is given more than once, as for `--baseline`.
 */
function assertSummaryName(value: unknown): asserts value is string {
  if (Array.isArray(value)) {
    throw new LayerscopeError('The option --summary was given more than once. Give it one time.');
  }
  if (typeof value === 'string' && value !== '') {
    return;
  }
  const hint =
    typeof value === 'number' && value !== 0
      ? ' For a file name that is a number, write it as ./<name>.'
      : '';
  throw new LayerscopeError(`The option --summary needs a file name.${hint}`);
}

/**
 * Writes the summary of the findings to the file, and `stale`: the Markdown of the fixed entries that
 * fail `--strict-baseline`, or empty. The file is empty when there is no finding and no such entry.
 */
export function writeSummary(summary: unknown, findings: Finding[], stale = ''): void {
  if (typeof summary !== 'string') {
    return;
  }
  const parts = [formatFindingsSummary(findings, currentDir()), stale].filter(part => part !== '');
  try {
    writeFileSync(resolve(currentDir(), summary), parts.join('\n'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new LayerscopeError(`The summary file cannot be written: ${reason}`);
  }
}

/** The same path, or two paths of one file on disk (a link). */
function sameFile(a: string, b: string): boolean {
  if (a === b) {
    return true;
  }
  try {
    const first = statSync(a);
    const second = statSync(b);
    return first.ino === second.ino && first.dev === second.dev;
  } catch {
    return false;
  }
}

/**
 * The `--summary` option: a file name, only with `--format github`, and not with `--watch` or
 * `--update-baseline`, which do not make a list of findings. It empties the file at once, so an
 * old list cannot stay when the check stops with an error later. Without `--baseline`, it loads
 * the config to find the baseline file. So a config error stops the run before the file is emptied,
 * and an old list stays in it. The action makes a new file for each run.
 */
export async function prepareSummary(
  summary: unknown,
  format: string,
  flags: { watch?: boolean; updateBaseline?: boolean; baseline?: string; config?: string },
  rootDir: string,
): Promise<void> {
  if (summary === undefined) {
    return;
  }
  if (format !== 'github') {
    throw new LayerscopeError('The option --summary works only with --format github.');
  }
  assertSummaryName(summary);
  if (flags.watch === true) {
    throw new LayerscopeError('--watch cannot be used with --summary.');
  }
  if (flags.updateBaseline === true) {
    throw new LayerscopeError('--update-baseline cannot be used with --summary.');
  }
  // The summary path is from the current directory, the baseline path is from the root. Emptying
  // the baseline file would lose its entries.
  const config = flags.baseline === undefined ? await loadConfig(rootDir, flags.config) : {};
  const baseline = baselinePath(rootDir, baselineName(flags.baseline, config));
  if (sameFile(resolve(currentDir(), summary), baseline)) {
    throw new LayerscopeError('--summary and the baseline name the same file.');
  }
  writeSummary(summary, []);
}
