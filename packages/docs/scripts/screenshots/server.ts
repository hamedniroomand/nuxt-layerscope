import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const START_TIMEOUT = 180_000;

export interface DevServer {
  base: string;
  stop: () => void;
}

/** A TCP port that is free now. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  await new Promise(resolve => {
    server.close(resolve);
  });
  if (address === null || typeof address === 'string') {
    throw new Error('Cannot get a free port.');
  }
  return address.port;
}

async function ready(base: string, child: ChildProcess, output: () => string): Promise<void> {
  const end = Date.now() + START_TIMEOUT;
  while (Date.now() < end) {
    if (child.exitCode !== null) {
      throw new Error(`nuxi dev stopped with code ${child.exitCode}:\n${output()}`);
    }
    const response = await fetch(`${base}/__layerscope/api/state`).catch(() => null);
    if (response?.ok === true) {
      return;
    }
    await delay(500);
  }
  throw new Error(`The dev server did not start in ${START_TIMEOUT / 1000} s.`);
}

/** Starts `nuxi dev` in `root` and waits until the tab answers. */
export async function startDevServer(root: string): Promise<DevServer> {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(
    'pnpm',
    ['exec', 'nuxi', 'dev', '--host', '127.0.0.1', '--port', String(port), '--no-qr'],
    {
      cwd: root,
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  let errors = '';
  child.stderr.on('data', (chunk: Buffer) => {
    errors = `${errors}${chunk.toString()}`.slice(-2000);
  });
  const stop = (): void => {
    if (child.pid !== undefined && child.exitCode === null) {
      process.kill(-child.pid, 'SIGTERM');
    }
  };
  // Also on a crash: a server left running holds the Nuxt dev lock of the project.
  process.once('exit', stop);
  try {
    await ready(base, child, () => errors);
  } catch (error) {
    stop();
    throw error;
  }
  return { base, stop };
}
