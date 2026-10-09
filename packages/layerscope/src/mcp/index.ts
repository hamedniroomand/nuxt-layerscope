import type { Readable } from 'node:stream';

import { serveLines } from './rpc.ts';
import { createHandler } from './server.ts';
import type { ServerInfo } from './server.ts';
import { ProjectSession } from './session.ts';
import type { SessionOptions } from './session.ts';
import { TOOLS } from './tools/index.ts';

export interface McpOptions extends SessionOptions {
  version: string;
  input: Readable;
  write: (text: string) => void;
}

/** Serves MCP over lines until `input` ends. Resolves with the exit code. */
export async function runMcp(options: McpOptions): Promise<number> {
  const info: ServerInfo = { name: 'nuxt-layerscope', version: options.version };
  const handler = createHandler(TOOLS, new ProjectSession(options), info);
  options.input.setEncoding('utf8');
  await serveLines(options.input, options.write, handler);
  return 0;
}
