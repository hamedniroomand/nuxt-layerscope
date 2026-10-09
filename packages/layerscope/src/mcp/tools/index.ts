import { checkTool } from '#src/mcp/tools/check.ts';
import type { Tool } from '#src/mcp/types.ts';

import { canUseTool } from './can-use.ts';
import { graphTool } from './graph.ts';
import { layersTool } from './layers.ts';
import { suggestTool } from './suggest.ts';
import { whyTool } from './why.ts';

export const TOOLS: Tool[] = [checkTool, whyTool, layersTool, canUseTool, suggestTool, graphTool];
