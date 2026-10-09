import { planMoves } from '#src/fix/plan.ts';
import type { Tool } from '#src/mcp/types.ts';
import { ToolError } from '#src/mcp/types.ts';
import { relativeFinding } from '#src/report/json.ts';

export const suggestTool: Tool = {
  name: 'suggest',
  title: 'Suggested fix for a finding',
  description:
    'The suggested fix of the findings in a file, for one line or symbol if given. A move says ' +
    'where the file goes and which imports change. Nothing is changed. Allow only what the ' +
    'user has said is an intended dependency.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['file'],
    properties: {
      file: { type: 'string', description: 'Path relative to the project root.' },
      line: { type: 'integer', minimum: 1 },
      symbol: { type: 'string' },
      rule: { type: 'string' },
    },
  },
  outputSchema: {
    type: 'object',
    required: ['file', 'suggestions'],
    properties: { file: { type: 'string' }, suggestions: { type: 'array' } },
  },
  async run(args, session) {
    const result = await session.result();
    const file = session.resolveFile(String(args.file), result.layers);
    const moves = planMoves(result);
    const suggestions = result.findings
      .filter(
        finding =>
          session.real(finding.file) === file &&
          finding.suggestion !== undefined &&
          (args.line === undefined || finding.line === args.line) &&
          (args.symbol === undefined || finding.symbol === args.symbol) &&
          (args.rule === undefined || finding.rule === args.rule),
      )
      .map(finding => {
        const move = moves.find(candidate => candidate.from === finding.target);
        return {
          finding: relativeFinding(finding, session.rootDir),
          suggestion: finding.suggestion,
          importsToUpdate:
            finding.suggestion?.action === 'move' && move !== undefined
              ? move.updates.map(update => ({
                  file: session.relative(update.file),
                  line: update.line,
                  from: update.specifier,
                  to: update.updated,
                }))
              : [],
        };
      });
    if (
      suggestions.length === 0 &&
      !result.files.some(candidate => session.real(candidate) === file)
    ) {
      throw new ToolError(`"${String(args.file)}" is not a file that layerscope checks.`);
    }
    return { file: session.relative(file), suggestions };
  },
};
