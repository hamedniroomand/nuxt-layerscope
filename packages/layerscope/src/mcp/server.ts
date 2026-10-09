import { LayerscopeError } from '#src/errors.ts';

import { INVALID_PARAMS, METHOD_NOT_FOUND, RpcError } from './rpc.ts';
import type { Handler } from './rpc.ts';
import type { ProjectSession } from './session.ts';
import type { Tool } from './types.ts';
import { ToolError } from './types.ts';
import { validateArgs } from './validate.ts';

/** Newest first. A client that asks for one of these gets it back. */
export const SUPPORTED_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  '2024-10-07',
] as const;

const INSTRUCTIONS =
  'Questions about the layers of a Nuxt project. Every tool only reads: none changes code, config ' +
  'or the baseline. Call can_use before you ' +
  'use a symbol from another layer, and check after you change code. Do not loosen "allow", add ' +
  '"globals", change "rules" or edit the baseline to get a clean result: that is a design ' +
  'decision for the user.';

export interface ServerInfo {
  name: string;
  version: string;
}

function negotiate(requested: unknown): string {
  const known = SUPPORTED_PROTOCOL_VERSIONS.find(version => version === requested);
  return known ?? SUPPORTED_PROTOCOL_VERSIONS[0];
}

function describeTool(tool: Tool): object {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  };
}

function textResult(text: string, isError: boolean): object {
  return { content: [{ type: 'text', text }], isError };
}

async function callTool(tool: Tool, args: unknown, session: ProjectSession): Promise<object> {
  // The spec asks for a result the model can read, so it can correct itself, not a protocol error.
  const problem = validateArgs(tool.inputSchema, args);
  if (problem !== null) {
    return textResult(`Invalid arguments: ${problem}`, true);
  }
  try {
    const data = await tool.run((args ?? {}) as Record<string, unknown>, session);
    return { ...textResult(JSON.stringify(data), false), structuredContent: data };
  } catch (error) {
    if (error instanceof ToolError || error instanceof LayerscopeError) {
      return textResult(error.message, true);
    }
    throw error;
  }
}

/** The methods of an MCP server that only offers tools. */
export function createHandler(tools: Tool[], session: ProjectSession, info: ServerInfo): Handler {
  const byName = new Map(tools.map(tool => [tool.name, tool]));
  return async (method, params) => {
    const input = (params ?? {}) as Record<string, unknown>;
    switch (method) {
      case 'initialize':
        if (typeof input.protocolVersion !== 'string') {
          throw new RpcError(INVALID_PARAMS, 'initialize needs a protocolVersion');
        }
        return {
          protocolVersion: negotiate(input.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: info.name, title: 'layerscope', version: info.version },
          instructions: INSTRUCTIONS,
        };
      case 'ping':
        return {};
      case 'tools/list':
        return { tools: tools.map(tool => describeTool(tool)) };
      case 'tools/call': {
        const tool = byName.get(String(input.name));
        if (tool === undefined) {
          throw new RpcError(INVALID_PARAMS, `Unknown tool: ${String(input.name)}`);
        }
        const result = await callTool(tool, input.arguments, session);
        return result;
      }
      default:
        if (method.startsWith('notifications/')) {
          return null;
        }
        throw new RpcError(METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  };
}
