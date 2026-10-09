import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { join } from 'pathe';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { NUXT4_ROOT } from '#test/fixtures.ts';

import { tempDir } from './watch-project.ts';

/** The server as a program, run from source, and the official SDK client as its user. */
const BIN = fileURLToPath(new URL('../src/bin.ts', import.meta.url));

let client: Client;

beforeAll(async () => {
  client = new Client({ name: 'layerscope-test', version: '0.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [BIN, 'mcp', NUXT4_ROOT],
      stderr: 'pipe',
    }),
  );
}, 30_000);

afterAll(async () => {
  await client.close();
});

describe('layerscope mcp with a config that writes to stdout', () => {
  it('keeps stdout JSON-RPC: the noise goes to stderr', async () => {
    const dir = tempDir();
    const configFile = join(dir, 'noisy.config.mjs');
    writeFileSync(
      configFile,
      [
        "console.log('noise from console.log');",
        "console.info('noise from console.info');",
        "process.stdout.write('noise from stdout.write\\n');",
        "export default { layers: { admin: { allow: ['shared'] } } };",
      ].join('\n'),
    );
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [BIN, 'mcp', NUXT4_ROOT, '--config', configFile],
      stderr: 'pipe',
    });
    const errors: Error[] = [];
    const noisy = new Client({ name: 'layerscope-test', version: '0.0.0' });
    transport.onerror = (error: Error): void => {
      errors.push(error);
    };
    const stderr: string[] = [];
    await noisy.connect(transport);
    transport.stderr?.on('data', (chunk: Buffer) => {
      stderr.push(String(chunk));
    });
    const result = await noisy.callTool({ name: 'layers', arguments: {} });
    await noisy.callTool({ name: 'check', arguments: {} });
    await noisy.close();
    expect(result.isError).toBeFalsy();
    expect(errors).toEqual([]);
    expect(stderr.join('')).toContain('noise from');
  }, 30_000);
});

describe('layerscope mcp with the SDK client', () => {
  it('agrees on the newest protocol version and lists the tools', async () => {
    expect(client.getServerVersion()?.name).toBe('nuxt-layerscope');
    const { tools } = await client.listTools();
    expect(tools.map(tool => tool.name)).toEqual([
      'check',
      'why',
      'layers',
      'can_use',
      'suggest',
      'graph',
    ]);
    expect(LATEST_PROTOCOL_VERSION).toBe('2025-11-25');
  });

  it('calls every tool, and the SDK accepts each result against its output schema', async () => {
    const calls: [string, Record<string, unknown>][] = [
      ['check', { layers: ['admin'], limit: 5 }],
      ['why', { symbol: 'useCart' }],
      ['layers', {}],
      ['can_use', { from: 'admin', to: 'useCart' }],
      ['suggest', { file: 'layers/admin/app/components/AdminPanel.vue' }],
      ['graph', {}],
    ];
    for (const [name, args] of calls) {
      // eslint-disable-next-line no-await-in-loop -- one call for each tool
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError, name).toBeFalsy();
      expect(result.structuredContent, name).toBeTruthy();
    }
  });

  it('answers a bad call with a result that the model can read', async () => {
    const result = await client.callTool({ name: 'check', arguments: { limit: 0 } });
    expect(result.isError).toBe(true);
  });
});
