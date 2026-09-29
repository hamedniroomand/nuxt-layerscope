import type { AnalyzeResult } from '#src/types.ts';
import { plain } from '#src/utils/style.ts';
import type { Paint } from '#src/utils/style.ts';

import { formatGithub } from './github.ts';
import { formatJson } from './json.ts';
import { formatText } from './text.ts';

export const OUTPUT_FORMATS = ['text', 'github', 'json'] as const;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

const formatters: Record<
  OutputFormat,
  (result: AnalyzeResult, cwd: string, paint: Paint) => string
> = {
  text: formatText,
  github: formatGithub,
  json: formatJson,
};

export function isOutputFormat(value: string): value is OutputFormat {
  return Object.hasOwn(formatters, value);
}

/** Paths in the output are relative to `cwd`. Only the text format uses `paint`. */
export function formatResult(
  result: AnalyzeResult,
  format: OutputFormat,
  cwd: string = process.cwd(),
  paint: Paint = plain,
): string {
  return formatters[format](result, cwd, paint);
}
