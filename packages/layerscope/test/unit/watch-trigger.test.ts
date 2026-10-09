import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { Trigger } from '#src/watch/trigger.ts';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Trigger', () => {
  it('runs once for a burst of changes', async () => {
    const run = vi.fn(async () => {
      await Promise.resolve();
    });
    const trigger = new Trigger(run, 100, 1000);
    trigger.touch();
    await vi.advanceTimersByTimeAsync(50);
    trigger.touch();
    await vi.advanceTimersByTimeAsync(99);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runs after the longest wait while changes keep coming', async () => {
    const run = vi.fn(async () => {
      await Promise.resolve();
    });
    const trigger = new Trigger(run, 100, 250);
    for (let step = 0; step < 6; step += 1) {
      trigger.touch();
      // eslint-disable-next-line no-await-in-loop -- one change every 60 ms, in order
      await vi.advanceTimersByTimeAsync(60);
    }
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('Trigger during a run', () => {
  it('queues exactly one more run for changes during a run', async () => {
    const releases: (() => void)[] = [];
    const run = vi.fn(async () => {
      await new Promise<void>(resolve => {
        releases.push(resolve);
      });
    });
    const trigger = new Trigger(run, 10, 100);
    trigger.touch();
    await vi.advanceTimersByTimeAsync(10);
    trigger.touch();
    await vi.advanceTimersByTimeAsync(10);
    trigger.touch();
    await vi.advanceTimersByTimeAsync(10);
    expect(run).toHaveBeenCalledTimes(1);
    releases[0]?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('keeps going when a run fails, and stops on request', async () => {
    const run = vi.fn(async () => {
      await Promise.resolve();
      throw new Error('boom');
    });
    const trigger = new Trigger(run, 10, 100);
    trigger.touch();
    await vi.advanceTimersByTimeAsync(10);
    trigger.touch();
    await vi.advanceTimersByTimeAsync(10);
    expect(run).toHaveBeenCalledTimes(2);
    trigger.stop();
    trigger.touch();
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
