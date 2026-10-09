import type { ProjectSession } from '#src/mcp/session.ts';
import type { Tool } from '#src/mcp/types.ts';
import { ToolError } from '#src/mcp/types.ts';
import { relativeFinding } from '#src/report/json.ts';
import { summarize } from '#src/report/summary.ts';
import type { Finding } from '#src/types.ts';
import { matchesGlob } from '#src/utils/glob.ts';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

const GLOB_CHARS = /[*?[]/u;

/** A path of a file or folder, or a glob, as a test on a path relative to the project root. */
export function fileMatcher(entries: string[], session: ProjectSession): (path: string) => boolean {
  const tests = entries.map((entry): ((path: string) => boolean) => {
    if (GLOB_CHARS.test(entry)) {
      if (entry.startsWith('/') || entry.split('/').includes('..')) {
        throw new ToolError(`"${entry}" must stay inside the project root.`);
      }
      return path => matchesGlob(entry, path);
    }
    const inside = session.relative(session.resolveInside(entry));
    return path => path === inside || path.startsWith(`${inside}/`);
  });
  return path => tests.some(test => test(path));
}

function listOf(value: unknown): string[] | undefined {
  return Array.isArray(value) ? (value as string[]) : undefined;
}

export function filterFindings(
  findings: Finding[],
  args: Record<string, unknown>,
  session: ProjectSession,
): Finding[] {
  const files = listOf(args.files);
  const layers = listOf(args.layers);
  const rules = listOf(args.rules);
  const inFiles = files === undefined ? undefined : fileMatcher(files, session);
  return findings.filter(
    finding =>
      (inFiles === undefined || inFiles(session.relative(finding.file))) &&
      (layers === undefined ||
        layers.includes(finding.fromLayer) ||
        (finding.toLayer !== null && layers.includes(finding.toLayer))) &&
      (rules === undefined || rules.includes(finding.rule)) &&
      (args.severity === undefined || finding.severity === args.severity),
  );
}

const STRINGS = { type: 'array', items: { type: 'string' } } as const;

export const checkTool: Tool = {
  name: 'check',
  title: 'Check layer boundaries',
  description:
    'Findings of the layer rules, with a suggested fix for each. Filter by file (path, folder or ' +
    'glob), by layer (the layer that uses or is used), by rule or by severity. Use it after a ' +
    'change. The answer is cut at `limit` findings; `truncated` says so.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      files: { ...STRINGS, description: 'Paths, folders or globs, relative to the project root.' },
      layers: { ...STRINGS, description: 'Layer names; a finding matches on either side.' },
      rules: { ...STRINGS, description: 'Rule names, such as layer-boundary.' },
      severity: { type: 'string', enum: ['error', 'warn'] },
      limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, description: 'Default 50.' },
    },
  },
  outputSchema: {
    type: 'object',
    required: ['summary', 'findings', 'total', 'returned', 'truncated'],
    properties: {
      summary: { type: 'object' },
      findings: { type: 'array' },
      total: { type: 'integer' },
      returned: { type: 'integer' },
      truncated: { type: 'boolean' },
    },
  },
  async run(args, session) {
    const result = await session.result();
    const matching = filterFindings(result.findings, args, session);
    const limit = typeof args.limit === 'number' ? args.limit : DEFAULT_LIMIT;
    const shown = matching.slice(0, limit);
    return {
      summary: { ...summarize(result.findings), files: result.files.length },
      findings: shown.map(finding => relativeFinding(finding, session.rootDir)),
      total: matching.length,
      returned: shown.length,
      truncated: matching.length > shown.length,
      baseline: {
        suppressed: result.baseline?.suppressed.length ?? 0,
        removable: result.baseline?.removable.length ?? 0,
      },
      notes: result.notes,
    };
  },
};
