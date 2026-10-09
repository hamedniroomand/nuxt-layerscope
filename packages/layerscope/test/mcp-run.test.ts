import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vite-plus/test';

import { runMcp } from '#src/mcp/index.ts';
import { TOOLS } from '#src/mcp/tools/index.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

import type { Reply } from './mcp-helpers.ts';

const line = (id: number, method: string, params?: unknown): string =>
  `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;

describe('runMcp', () => {
  it('answers initialize and tools/list, and exits with 0 when the input ends', async () => {
    const input = new PassThrough();
    const written: string[] = [];
    const done = runMcp({
      rootDir: NUXT4_ROOT,
      source: 'auto',
      baseline: 'layerscope-baseline.json',
      version: '1.2.3',
      input,
      write: text => {
        written.push(text);
      },
    });
    input.write(line(1, 'initialize', { protocolVersion: '2025-11-25' }));
    input.write(line(2, 'tools/list'));
    input.end();
    expect(await done).toBe(0);
    const [init, list] = written.map(text => JSON.parse(text) as Reply);
    expect(init.result).toMatchObject({
      serverInfo: { name: 'nuxt-layerscope', version: '1.2.3' },
    });
    const tools = list.result?.tools as { name: string }[];
    expect(tools.map(tool => tool.name)).toEqual(TOOLS.map(tool => tool.name));
  });
});
