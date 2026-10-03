import { setImmediate } from 'node:timers/promises';

const BATCH_FILES = 25;
const BATCH_MS = 8;

export interface YieldOptions {
  /** Files per batch. */
  files?: number;
  /** Milliseconds of work per batch. */
  ms?: number;
  now?: () => number;
  /** Gives the event loop a turn. A microtask is not enough: I/O callbacks run between turns. */
  turn?: () => Promise<void>;
}

/** One turn of the event loop, so a long analysis does not hold up the dev server. */
export async function yieldTurn(): Promise<void> {
  await setImmediate();
}

/**
 * Call after each unit of work; yields to the event loop after a batch of files or a few
 * milliseconds, whichever comes first.
 */
export function createYielder(options: YieldOptions = {}): () => Promise<void> {
  const { files = BATCH_FILES, ms = BATCH_MS, now = performance.now.bind(performance) } = options;
  const turn = options.turn ?? yieldTurn;
  let count = 0;
  let started = now();
  return async () => {
    count += 1;
    if (count < files && now() - started < ms) {
      return;
    }
    await turn();
    count = 0;
    started = now();
  };
}
