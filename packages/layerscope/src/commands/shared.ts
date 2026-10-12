import type { cac } from 'cac';
import { relative } from 'pathe';

import { LayerscopeError } from '#src/errors.ts';
import type { AnalyzeResult, SourceOption } from '#src/types.ts';
import { paintFor } from '#src/utils/style.ts';

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
    .option('--config <file>', 'Path to layerscope.config.ts')
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
    const source = relative(process.cwd(), result.sourceFile);
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
