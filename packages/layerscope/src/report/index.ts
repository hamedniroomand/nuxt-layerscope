import type { AnalyzeResult } from '#src/types.ts';

import { formatGithub } from './github.ts';
import { formatJson } from './json.ts';
import { formatText } from './text.ts';

export const OUTPUT_FORMATS = ['text', 'github', 'json'] as const;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

const formatters: Record<OutputFormat, (result: AnalyzeResult, cwd: string) => string> = {
  text: formatText,
  github: formatGithub,
  json: formatJson,
};

export function isOutputFormat(value: string): value is OutputFormat {
  return Object.hasOwn(formatters, value);
}

/** Paths in the output are relative to `cwd`. */
export function formatResult(
  result: AnalyzeResult,
  format: OutputFormat,
  cwd: string = process.cwd(),
): string {
  return formatters[format](result, cwd);
}
