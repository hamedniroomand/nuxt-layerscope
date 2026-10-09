import { ToolError } from '#src/mcp/types.ts';
import type { Tool } from '#src/mcp/types.ts';
import { toWhyReport } from '#src/report/why.ts';
import { findUses } from '#src/why/index.ts';

export const whyTool: Tool = {
  name: 'why',
  title: 'Find every use of a symbol',
  description:
    'Every use of an auto-import, component or import, the file and layer that owns it, whether ' +
    'its layer exposes it, and whether each use is allowed.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['symbol'],
    properties: {
      symbol: {
        type: 'string',
        description: 'An auto-import or component name; Lazy and kebab-case spellings work.',
      },
    },
  },
  outputSchema: {
    type: 'object',
    required: ['symbol', 'targets'],
    properties: { symbol: { type: 'string' }, targets: { type: 'array' } },
  },
  async run(args, session) {
    const result = await session.result();
    const symbol = String(args.symbol);
    const targets = findUses(result, symbol, result.config);
    if (targets.length === 0) {
      throw new ToolError(`No uses of "${symbol}" found.`);
    }
    return toWhyReport(symbol, targets, session.rootDir);
  },
};
