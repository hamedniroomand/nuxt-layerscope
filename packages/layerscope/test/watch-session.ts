import { join } from 'pathe';
import { expect, vi } from 'vite-plus/test';

import { formatResult } from '#src/report/index.ts';
import { plain } from '#src/utils/style.ts';
import { watchCheck } from '#src/watch/index.ts';
import type { WatchOptions } from '#src/watch/index.ts';
import type { Change, StartWatcher } from '#src/watch/watcher.ts';

export function noop(): void {
  // Nothing to do.
}

/**
 * For a later `start` call (a batch of dirs outside the root): gives the `ready` promise of the new
 * watcher. A throw makes the start fail.
 */
export type OnBatch = (paths: string[]) => Promise<void>;

export interface Session {
  /** The paths of each `start` call, in order: the root first, then each batch. */
  starts: string[][];
  /** How many watchers were closed. */
  closed: () => number;
  out: string[];
  err: string[];
  stop: () => Promise<number>;
  change: (change?: Partial<Change>) => void;
}

interface FakeWatcher {
  startWatcher: StartWatcher;
  starts: string[][];
  closed: () => number;
  send: (change: Change) => void;
}

/**
 * A watcher the test drives: it records the paths of each `start` call and sends the changes it
 * is told to. `onBatch` runs for each `start` call after the first.
 */
function fakeWatcher(onBatch?: OnBatch): FakeWatcher {
  const starts: string[][] = [];
  const handlers: ((change: Change) => void)[] = [];
  const state = { closed: 0 };
  const startWatcher: StartWatcher = async (paths, _buildDir, onChange) => {
    starts.push(paths);
    handlers.push(onChange);
    await Promise.resolve();
    return {
      ready: starts.length > 1 && onBatch !== undefined ? onBatch(paths) : Promise.resolve(),
      close: async () => {
        state.closed += 1;
        await Promise.resolve();
      },
    };
  };
  return {
    startWatcher,
    starts,
    closed: () => state.closed,
    send: change => {
      for (const handler of handlers) {
        handler(change);
      }
    },
  };
}

/** Runs the watch with a watcher that the test drives, and with short delays. */
export function start(
  root: string,
  format: 'text' | 'json' = 'text',
  tty = false,
  extra: Partial<WatchOptions> = {},
  onBatch?: OnBatch,
): Session {
  const { startWatcher, starts, closed, send } = fakeWatcher(onBatch);
  const out: string[] = [];
  const err: string[] = [];
  const abort = new AbortController();
  const options: WatchOptions = {
    rootDir: root,
    source: 'auto',
    baseline: 'layerscope-baseline.json',
    prepare: false,
    render: result => formatResult(result, format, root, plain),
    human: format === 'text',
    tty,
    write: text => {
      out.push(text);
    },
    warn: text => {
      err.push(text);
    },
    signal: abort.signal,
    delayMs: 5,
    maxWaitMs: 50,
    startWatcher,
    ...extra,
  };
  const done = watchCheck(options);
  return {
    starts,
    closed,
    out,
    err,
    stop: async () => {
      abort.abort();
      const code = await done;
      return code;
    },
    change: change => {
      send({ path: join(root, 'x'), config: false, ...change });
    },
  };
}

export const joined = (lines: string[]): string => lines.join('');

/** Waits until the text is on the screen (or stderr, for `err`). */
export async function seen(lines: string[], text: string, timeout = 5000): Promise<void> {
  await vi.waitFor(
    () => {
      expect(joined(lines)).toContain(text);
    },
    { timeout },
  );
}
