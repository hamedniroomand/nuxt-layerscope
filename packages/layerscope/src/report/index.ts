import type { AnalyzeResult } from '#src/types.ts';
import { currentDir } from '#src/utils/fs.ts';
import { plain } from '#src/utils/style.ts';
import type { Paint } from '#src/utils/style.ts';

import { DEFAULT_RUN } from './baseline.ts';
import type { BaselineRun } from './baseline.ts';
import { formatGithub } from './github.ts';
import { formatGitlab } from './gitlab.ts';
import { formatJson } from './json.ts';
import { formatSarif } from './sarif.ts';
import { formatText } from './text.ts';

export const OUTPUT_FORMATS = ['text', 'github', 'json', 'sarif', 'gitlab'] as const;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

const formatters: Record<
  OutputFormat,
  (result: AnalyzeResult, cwd: string, paint: Paint, repoRoot: string, run: BaselineRun) => string
> = {
  text: (result, cwd, paint, _repoRoot, run) => formatText(result, cwd, paint, run),
  github: (result, cwd, _paint, _repoRoot, run) => formatGithub(result, cwd, run),
  json: formatJson,
  sarif: formatSarif,
  gitlab: formatGitlab,
};

export function isOutputFormat(value: string): value is OutputFormat {
  return Object.hasOwn(formatters, value);
}

/**
 * Paths in the output are relative to `cwd`, except in `sarif` and `gitlab`, where they are
 * relative to `repoRoot` (default: the project root). Only the text format uses `paint`. Only the
 * text and `github` formats use `run`: they give its command in the hint for fixed entries. With
 * --strict-baseline, the text footer has no ✔ and no color when no finding is left and fixed entries
 * fail the check, and a fixed entry is an error in github.
 */
export function formatResult(
  result: AnalyzeResult,
  format: OutputFormat,
  cwd: string = currentDir(),
  paint: Paint = plain,
  repoRoot: string = result.rootDir,
  run: BaselineRun = DEFAULT_RUN,
): string {
  return formatters[format](result, cwd, paint, repoRoot, run);
}
