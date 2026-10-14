import { relative } from 'pathe';

import { LayerscopeError } from '#src/errors.ts';
import { strictEntries } from '#src/report/baseline.ts';
import { formatStaleSummary } from '#src/report/findings-summary.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { paintFor } from '#src/utils/style.ts';

import { currentDir } from './shared.ts';

interface StrictFlags {
  baseline?: string;
  strictBaseline?: boolean;
  updateBaseline?: boolean;
  watch?: boolean;
}

/** `--strict-baseline` has no meaning with an update of the file, or in a run with no exit code. */
export function assertStrictFlags(flags: StrictFlags): void {
  if (flags.strictBaseline !== true) {
    return;
  }
  if (flags.updateBaseline === true) {
    throw new LayerscopeError('--strict-baseline cannot be used with --update-baseline.');
  }
  if (flags.watch === true) {
    throw new LayerscopeError('--watch cannot be used with --strict-baseline.');
  }
}

/** A value as the user can type it in a shell. */
function shellWord(value: string): string {
  return /^[\w./@:=+-]+$/u.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * The command that removes the fixed entries: the same root and the same `--baseline` as this run.
 * A `baseline` key in the config needs nothing, because the config names the file.
 */
function updateCommand(root: string | undefined, flags: StrictFlags): string {
  const words = ['layerscope', 'check'];
  if (root !== undefined) {
    words.push(shellWord(root));
  }
  if (flags.baseline !== undefined) {
    words.push('--baseline', shellWord(flags.baseline));
  }
  return [...words, '--update-baseline'].join(' ');
}

export interface StrictOutcome {
  failed: boolean;
  /** The Markdown part of `--summary`, or empty. */
  summary: string;
}

/**
 * Reports the fixed entries that fail `--strict-baseline`: a red line under the text report, or a
 * line on stderr for the other formats, so that their stdout stays machine-readable.
 */
export function reportStrict(
  result: AnalyzeResult,
  root: string | undefined,
  flags: StrictFlags & { format: string },
): StrictOutcome {
  const entries = flags.strictBaseline === true ? strictEntries(result) : [];
  if (entries.length === 0 || result.baseline === undefined) {
    return { failed: false, summary: '' };
  }
  const command = updateCommand(root, flags);
  const file = relative(currentDir(), result.baseline.file);
  const count =
    entries.length === 1
      ? '1 fixed entry in the baseline fails'
      : `${entries.length} fixed entries in the baseline fail`;
  const head = `${count} the check (--strict-baseline).`;
  if (flags.format === 'text') {
    const paint = paintFor(process.stdout);
    process.stdout.write(
      `${paint(['red', 'bold'], `✖ ${head} Run "${command}" and commit ${file}.`)}\n`,
    );
  } else {
    process.stderr.write(`layerscope: ${head} Run "${command}" and commit ${file}.\n`);
  }
  return {
    failed: true,
    summary: formatStaleSummary(entries, `${head} Run \`${command}\` and commit ${file}.`),
  };
}
