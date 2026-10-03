import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { EventSourceLike, LiveHandlers } from '#src/devtools/client/lib/live.ts';
import { connectLive } from '#src/devtools/client/lib/live.ts';

class FakeSource implements EventSourceLike {
  public onopen: ((event: Event) => unknown) | null = null;
  public onerror: ((event: Event) => unknown) | null = null;
  public closed = false;
  private readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();

  public addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, listener);
  }

  public close(): void {
    this.closed = true;
  }

  public emit(type: string, data: unknown): void {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
}

function handlers(): LiveHandlers & Record<keyof LiveHandlers, ReturnType<typeof vi.fn>> {
  return {
    snapshot: vi.fn<LiveHandlers['snapshot']>().mockResolvedValue(),
    error: vi.fn<LiveHandlers['error']>(),
    poll: vi.fn<LiveHandlers['poll']>().mockResolvedValue(true),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('live client', () => {
  it('goes live on open, follows the pause state and passes snapshots on', () => {
    const source = new FakeSource();
    const on = handlers();
    const live = connectLive({ url: '/e', open: () => source, handlers: on });
    expect(live.status.value).toBe('connecting');
    source.onopen?.(new Event('open'));
    expect(live.status.value).toBe('live');
    source.emit('state', { live: { clients: 1, paused: true } });
    expect(live.status.value).toBe('paused');
    expect(live.paused.value).toBe(true);
    source.emit('snapshot', { rev: 2 });
    expect(on.snapshot).toHaveBeenCalledWith({ rev: 2 });
    source.emit('error', { error: 'boom' });
    expect(on.error).toHaveBeenCalledWith('boom');
  });

  it('reconnects after one failure and polls after two', () => {
    const source = new FakeSource();
    const on = handlers();
    const live = connectLive({ url: '/e', open: () => source, handlers: on, pollMs: 3000 });
    source.onerror?.(new Event('error'));
    expect(live.status.value).toBe('reconnecting');
    source.onopen?.(new Event('open'));
    source.onerror?.(new Event('error'));
    expect(live.status.value).toBe('reconnecting');
    source.onerror?.(new Event('error'));
    expect(live.status.value).toBe('polling');
    expect(source.closed).toBe(true);
    vi.advanceTimersByTime(6000);
    expect(on.poll).toHaveBeenCalledTimes(2);
    live.close();
    vi.advanceTimersByTime(6000);
    expect(on.poll).toHaveBeenCalledTimes(2);
  });
});
