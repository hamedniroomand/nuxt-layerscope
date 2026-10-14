import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';

import { join } from 'pathe';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { ProjectSession } from '#src/mcp/session.ts';
import type { Registry } from '#src/registry/schema.ts';

import { callTool } from './mcp-helpers.ts';
import type { ToolResult } from './mcp-helpers.ts';
import { privateFixture } from './private-fixture.ts';

const UTIL = 'layers/web/server/utils/devNewUtil.ts';

let copy = '';
let dev: ChildProcess | undefined;

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => {
    server.listen(0, resolve);
  });
  const address = server.address();
  await new Promise<void>(resolve => {
    server.close(() => {
      resolve();
    });
  });
  return typeof address === 'object' && address !== null ? address.port : 0;
}

/** Waits until `ready` is true, and fails with the text of `what` after `timeoutMs`. */
async function waitFor(
  what: () => string,
  ready: () => boolean,
  timeoutMs = 20_000,
): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!ready()) {
    if (Date.now() > end) {
      throw new Error(`Timed out: ${what()}`);
    }
    // eslint-disable-next-line no-await-in-loop -- polls until the condition is true
    await new Promise(resolve => {
      setTimeout(resolve, 100);
    });
  }
}

/** Stops the process and waits until it exits, so that `.nuxt/nuxt.lock` does not stop a next run. */
async function stopDev(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const exited = new Promise<void>(resolve => {
    child.once('exit', () => {
      resolve();
    });
  });
  child.kill('SIGTERM');
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
  }, 5000);
  await exited;
  clearTimeout(timer);
}

/**
 * The env of the test without the marks of a test run. With them, Nuxt runs in test mode and its
 * logger does not print the line that this test waits for.
 */
function devEnv(): NodeJS.ProcessEnv {
  const isTestMark = (name: string): boolean =>
    name === 'NODE_ENV' || name === 'TEST' || name.startsWith('VITEST');
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !isTestMark(name))),
    NUXT_TELEMETRY_DISABLED: '1',
  };
}

/** Starts `nuxi dev` as a node process, so that the PID is the PID of Nuxt and not of a shim. */
async function startDev(dir: string): Promise<ChildProcess> {
  const bin = join(dir, 'node_modules/nuxt/bin/nuxt.mjs');
  const port = await freePort();
  const child = spawn(process.execPath, [bin, 'dev', '--no-fork', '--port', String(port)], {
    cwd: dir,
    env: devEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  try {
    // Nitro is built after `build:done`, where the module adds its watcher handler.
    await waitFor(
      () => `nuxi dev is ready\n${output}`,
      () => /server built/u.test(output),
      60_000,
    );
  } catch (error) {
    await stopDev(child);
    throw error;
  }
  return child;
}

/** The server imports of the registry. The module replaces the file in one step, so it is whole. */
function serverImports(): string[] {
  const text = readFileSync(join(copy, '.nuxt/layerscope/registry.json'), 'utf8');
  return (JSON.parse(text) as Registry).imports.server.map(entry => entry.name);
}

beforeAll(async () => {
  copy = privateFixture(false);
  dev = await startDev(copy);
}, 120_000);

afterAll(async () => {
  try {
    if (dev !== undefined) {
      await stopDev(dev);
    }
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}, 30_000);

/** An MCP session whose clock moves 1 s on each call, so that each call makes a new run. */
function mcpCheck(): () => Promise<ToolResult> {
  const clock = { now: 1000 };
  const session = new ProjectSession({
    rootDir: copy,
    source: 'auto',
    baseline: 'layerscope-baseline.json',
    now: (): number => clock.now,
  });
  return async (): Promise<ToolResult> => {
    clock.now += 1000;
    const result = await callTool('check', {}, session);
    return result;
  };
}

describe('the module under nuxi dev (#158)', () => {
  it('writes the registry again after a new and a deleted server util', async () => {
    const check = mcpCheck();
    const file = join(copy, UTIL);
    expect((await check()).isError).toBe(false);
    writeFileSync(file, 'export function devNewUtil() {\n  return 1;\n}\n');
    await waitFor(
      () => 'the registry lists the new server util',
      () => serverImports().includes('devNewUtil'),
    );
    expect((await check()).isError).toBe(false);
    rmSync(file);
    await waitFor(
      () => 'the registry drops the deleted server util',
      () => !serverImports().includes('devNewUtil'),
    );
    expect((await check()).isError).toBe(false);
  }, 60_000);
});
