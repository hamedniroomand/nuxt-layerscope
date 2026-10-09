import type { AnalyzeResult } from '#src/types.ts';
import { plain } from '#src/utils/style.ts';
import type { Paint } from '#src/utils/style.ts';

import { formatGithub } from './github.ts';
import { formatGitlab } from './gitlab.ts';
import { formatJson } from './json.ts';
import { formatSarif } from './sarif.ts';
import { formatText } from './text.ts';

export const OUTPUT_FORMATS = ['text', 'github', 'json', 'sarif', 'gitlab'] as const;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

const formatters: Record<
  OutputFormat,
  (result: AnalyzeResult, cwd: string, paint: Paint, repoRoot: string) => string
> = {
  text: formatText,
  github: formatGithub,
  json: formatJson,
  sarif: formatSarif,
  gitlab: formatGitlab,
};

export function isOutputFormat(value: string): value is OutputFormat {
  return Object.hasOwn(formatters, value);
}

/**
 * Paths in the output are relative to `cwd`, except in `sarif` and `gitlab`, where they are
 * relative to `repoRoot` (default: the project root). Only the text format uses `paint`.
 */
export function formatResult(
  result: AnalyzeResult,
  format: OutputFormat,
  cwd: string = process.cwd(),
  paint: Paint = plain,
  repoRoot: string = result.rootDir,
): string {
  return formatters[format](result, cwd, paint, repoRoot);
}
