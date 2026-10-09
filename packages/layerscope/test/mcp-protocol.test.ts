import { SUPPORTED_PROTOCOL_VERSIONS as SDK_VERSIONS } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vite-plus/test';

import { SUPPORTED_PROTOCOL_VERSIONS } from '#src/mcp/server.ts';
import { TOOLS } from '#src/mcp/tools/index.ts';

import type { Reply } from './mcp-helpers.ts';
import { exchange, request } from './mcp-helpers.ts';

const parse = (line: string): Reply => JSON.parse(line) as Reply;
const message = (id: number, method: string, params?: unknown): string =>
  `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;

describe('protocol versions', () => {
  it('support every version that the SDK knows, newest first', () => {
    // Fails when an SDK update brings a version that the server does not list yet.
    for (const version of SDK_VERSIONS) {
      expect(SUPPORTED_PROTOCOL_VERSIONS).toContain(version);
    }
    expect(SUPPORTED_PROTOCOL_VERSIONS[0]).toBe(SDK_VERSIONS[0]);
  });
});

describe('initialize', () => {
  it('answers with the version that the client asks for, when it is known', async () => {
    for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
      // eslint-disable-next-line no-await-in-loop -- one server for each version
      const reply = await request('initialize', { protocolVersion: version });
      expect(reply.result?.protocolVersion).toBe(version);
    }
  });

  it('answers with the newest version for an unknown one', async () => {
    const reply = await request('initialize', { protocolVersion: '1999-01-01' });
    expect(reply.result?.protocolVersion).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
  });

  it('names the server, offers tools and says that they only read', async () => {
    const reply = await request('initialize', { protocolVersion: '2025-11-25' });
    expect(reply.result).toMatchObject({
      capabilities: { tools: {} },
      serverInfo: { name: 'nuxt-layerscope', version: '9.9.9' },
    });
  });

  it('tells the model that the tools only read, and not to loosen allow', async () => {
    const reply = await request('initialize', { protocolVersion: '2025-11-25' });
    const instructions = String(reply.result?.instructions);
    expect(instructions).toContain('only reads');
    expect(instructions).toContain('Do not loosen "allow"');
  });

  it('needs a protocolVersion', async () => {
    const reply = await request('initialize', {});
    expect(reply.error?.code).toBe(-32_602);
  });
});

describe('tools/list', () => {
  it('lists the six tools with schemas, and marks each as read-only', async () => {
    const reply = await request('tools/list');
    const tools = reply.result?.tools as {
      name: string;
      inputSchema: { additionalProperties: boolean };
      outputSchema: { type: string };
      annotations: { readOnlyHint: boolean };
    }[];
    expect(tools.map(tool => tool.name)).toEqual([
      'check',
      'why',
      'layers',
      'can_use',
      'suggest',
      'graph',
    ]);
    expect(TOOLS).toHaveLength(6);
    for (const tool of tools) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.outputSchema.type).toBe('object');
      expect(tool.annotations.readOnlyHint).toBe(true);
    }
  });
});

describe('tools/list and the layers tool', () => {
  it('declares preset in the output schema, as an object or null', async () => {
    const reply = await request('tools/list');
    const tools = reply.result?.tools as {
      name: string;
      outputSchema: { properties: Record<string, { type: unknown }> };
    }[];
    const layers = tools.find(tool => tool.name === 'layers');
    expect(layers?.outputSchema.properties.preset.type).toEqual(['object', 'null']);
  });
});

describe('framing and errors', () => {
  it('answers ping', async () => {
    expect((await request('ping')).result).toEqual({});
  });

  it('refuses an unknown method and an unknown tool', async () => {
    expect((await request('nope')).error?.code).toBe(-32_601);
    expect((await request('tools/call', { name: 'nope' })).error?.code).toBe(-32_602);
  });

  it('refuses invalid JSON and messages that are not requests', async () => {
    const [bad, notRequest] = await exchange(['{oops\n', '{"id":1}\n']);
    expect(parse(bad).error?.code).toBe(-32_700);
    expect(parse(notRequest).error?.code).toBe(-32_600);
  });

  it('gives no answer to a notification', async () => {
    const lines = await exchange([
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
    ]);
    expect(lines).toEqual([]);
  });

  it('answers two requests in one chunk, in order', async () => {
    const lines = await exchange([message(1, 'ping') + message(2, 'ping')]);
    expect(lines.map(line => parse(line).id)).toEqual([1, 2]);
  });

  it('waits for the end of a line that arrives in pieces', async () => {
    const text = message(7, 'ping');
    const lines = await exchange([text.slice(0, 10), text.slice(10, 20), text.slice(20)]);
    expect(lines.map(line => parse(line).id)).toEqual([7]);
  });
});

describe('framing of long and batched input', () => {
  it('reads a very long line, and a last request without a final newline', async () => {
    const long = message(1, 'tools/call', {
      name: 'check',
      arguments: { files: Array.from({ length: 3000 }, (_, index) => `layers/f${index}.ts`) },
    });
    const lines = await exchange([long, message(2, 'ping').trim()]);
    expect(lines).toHaveLength(2);
    expect(parse(lines[1]).id).toBe(2);
  });

  it('answers a batch with a batch', async () => {
    const batch = JSON.stringify([
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'ping' },
    ]);
    const [line] = await exchange([`${batch}\n`]);
    expect((JSON.parse(line) as Reply[]).map(reply => reply.id)).toEqual([1, 2]);
  });
});

describe('requests that are not valid', () => {
  it('answers an empty batch with one invalid request error', async () => {
    const [line] = await exchange(['[]\n']);
    const reply = JSON.parse(line) as Reply;
    expect(reply.error?.code).toBe(-32_600);
    expect(reply.id).toBeNull();
  });

  it.each(['true', '{}', '[]', '"x".length'])('refuses the id %s', async id => {
    const raw = id === '"x".length' ? '{"x":1}' : id;
    const [line] = await exchange([`{"jsonrpc":"2.0","id":${raw},"method":"ping"}\n`]);
    expect(JSON.parse(line) as Reply).toMatchObject({ id: null, error: { code: -32_600 } });
  });

  it('accepts a string, a number and a null id', async () => {
    const lines = await exchange(
      ['"a"', '7', 'null'].map(id => `{"jsonrpc":"2.0","id":${id},"method":"ping"}\n`),
    );
    expect(lines.map(line => (JSON.parse(line) as Reply).id)).toEqual(['a', 7, null]);
  });
});
