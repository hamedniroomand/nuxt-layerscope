import { PassThrough } from 'node:stream';

import { serveLines } from '#src/mcp/rpc.ts';
import { createHandler } from '#src/mcp/server.ts';
import { ProjectSession } from '#src/mcp/session.ts';
import { TOOLS } from '#src/mcp/tools/index.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

export interface Reply {
  jsonrpc: string;
  id: number | string | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

export function sessionFor(rootDir = NUXT4_ROOT): ProjectSession {
  return new ProjectSession({ rootDir, source: 'auto', baseline: 'layerscope-baseline.json' });
}

/** Sends the chunks to a server, one after the other, and returns every line it wrote. */
export async function exchange(chunks: string[], session = sessionFor()): Promise<string[]> {
  const input = new PassThrough();
  const lines: string[] = [];
  const handler = createHandler(TOOLS, session, { name: 'nuxt-layerscope', version: '9.9.9' });
  const done = serveLines(
    input,
    text => {
      lines.push(text);
    },
    handler,
  );
  for (const chunk of chunks) {
    input.write(chunk);
  }
  input.end();
  await done;
  return lines;
}

export async function request(
  method: string,
  params?: unknown,
  session = sessionFor(),
): Promise<Reply> {
  const [line] = await exchange(
    [`${JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })}\n`],
    session,
  );
  return JSON.parse(line) as Reply;
}

export interface ToolResult {
  isError: boolean;
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
}

export async function callTool(
  name: string,
  args: Record<string, unknown> = {},
  session = sessionFor(),
): Promise<ToolResult> {
  const reply = await request('tools/call', { name, arguments: args }, session);
  return reply.result as unknown as ToolResult;
}

export interface FindingData {
  file: string;
  line: number;
  rule: string;
  severity: string;
  symbol: string;
  fromLayer: string;
  toLayer: string | null;
  suggestion?: { action: string; message: string };
}

export interface CheckData {
  summary: { errors: number; warnings: number; files: number };
  findings: FindingData[];
  total: number;
  returned: number;
  truncated: boolean;
  baseline: { suppressed: number; removable: number };
}

export interface UseData {
  status: string;
}

export interface WhyData {
  targets: { layer: string | null; exposure: string; uses: UseData[] }[];
}

export interface LayersData {
  layers: {
    name: string;
    allow: { layer: string; only?: string[] }[] | null;
    expose: string[] | null;
  }[];
  rules: Record<string, string>;
}

export interface GraphData {
  nodes: { id: string }[];
  edges: { from: string; to: string; status: string }[];
  truncated: boolean;
}

export interface CanUseData {
  allowed: boolean;
  status: string;
  reason: string;
  only?: string[] | null;
  exposed?: string[] | null;
  from: { layer: string; file?: string };
  to: { layer: string | null; kind: string; symbol?: string; file?: string };
}

export interface SuggestData {
  file: string;
  suggestions: {
    finding: FindingData;
    suggestion: { action: string; message: string };
    importsToUpdate: unknown[];
  }[];
}

/** The structured content of a result, as the type that the test expects. */
export function dataOf<T>(result: ToolResult): T {
  return result.structuredContent as T;
}
