import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { Snapshot } from '#src/devtools/analyzer.ts';
import type { LiveMessage, LiveTarget } from '#src/devtools/live.ts';
import { Live } from '#src/devtools/live.ts';
import { makeFinding, makeResult } from '#test/factories.ts';

function snapshot(rev: number, findings = [makeFinding()]): Snapshot {
  return {
    id: 'a',
    rev,
    analyzedAt: 0,
    durationMs: 1,
    result: makeResult({ findings }),
    cause: 'analysis',
  };
}

function target(): LiveTarget & { refresh: ReturnType<typeof vi.fn> } {
  return {
    invalidate: vi.fn<() => void>(),
    refresh: vi.fn<() => Promise<Snapshot>>().mockResolvedValue(snapshot(0)),
  };
}

/** A listener that keeps every message it receives. */
function collect(messages: LiveMessage[]): (message: LiveMessage) => void {
  return message => {
    messages.push(message);
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('live re-runs', () => {
  it('only marks the analysis stale while no tab is connected', () => {
    const analyzer = target();
    const live = new Live(() => analyzer);
    live.invalidate();
    vi.advanceTimersByTime(5000);
    expect(analyzer.invalidate).toHaveBeenCalledOnce();
    expect(analyzer.refresh).not.toHaveBeenCalled();
  });

  it('runs once, 200 ms after the last of several quick changes', () => {
    const analyzer = target();
    const live = new Live(() => analyzer);
    live.connect(collect([]));
    live.invalidate();
    vi.advanceTimersByTime(100);
    live.invalidate();
    vi.advanceTimersByTime(100);
    live.invalidate();
    vi.advanceTimersByTime(199);
    expect(analyzer.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(analyzer.refresh).toHaveBeenCalledOnce();
  });

  it('runs within 1 s while changes keep coming', () => {
    const analyzer = target();
    const live = new Live(() => analyzer);
    live.connect(collect([]));
    for (let step = 0; step < 10; step += 1) {
      live.invalidate();
      vi.advanceTimersByTime(150);
    }
    expect(analyzer.refresh).toHaveBeenCalled();
    expect(analyzer.refresh.mock.calls.length).toBeLessThanOrEqual(2);
  });
});

describe('live pause', () => {
  it('does not run while paused and runs once on resume when something changed', () => {
    const analyzer = target();
    const live = new Live(() => analyzer);
    const messages: LiveMessage[] = [];
    live.connect(collect(messages));
    live.pause();
    live.invalidate();
    vi.advanceTimersByTime(2000);
    expect(analyzer.refresh).not.toHaveBeenCalled();
    live.resume();
    vi.advanceTimersByTime(200);
    expect(analyzer.refresh).toHaveBeenCalledOnce();
    live.resume();
    vi.advanceTimersByTime(2000);
    expect(analyzer.refresh).toHaveBeenCalledOnce();
    expect(messages.map(message => message.event)).toEqual(['state', 'state', 'state']);
  });

  it('keeps a run that was due when the tab pauses, and runs it on resume', () => {
    const analyzer = target();
    const live = new Live(() => analyzer);
    live.connect(collect([]));
    live.invalidate();
    vi.advanceTimersByTime(100);
    live.pause();
    vi.advanceTimersByTime(2000);
    expect(analyzer.refresh).not.toHaveBeenCalled();
    live.resume();
    vi.advanceTimersByTime(199);
    expect(analyzer.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(analyzer.refresh).toHaveBeenCalledOnce();
  });
});

describe('live tabs', () => {
  it('cancels a pending run when the last tab leaves', () => {
    const analyzer = target();
    const live = new Live(() => analyzer);
    const leave = live.connect(collect([]));
    live.invalidate();
    leave();
    vi.advanceTimersByTime(2000);
    expect(analyzer.refresh).not.toHaveBeenCalled();
    expect(live.state).toEqual({ clients: 0, paused: false });
  });

  it('reports a failed run to the tab', async () => {
    const analyzer = target();
    analyzer.refresh.mockRejectedValueOnce(new Error('boom'));
    const live = new Live(() => analyzer);
    const messages: LiveMessage[] = [];
    live.connect(collect(messages));
    live.invalidate();
    await vi.advanceTimersByTimeAsync(200);
    expect(messages).toEqual([{ event: 'error', data: { error: 'boom' } }]);
  });
});

describe('live findings', () => {
  it('sends the delta and the new count with each snapshot', () => {
    const live = new Live(target);
    const messages: LiveMessage[] = [];
    live.connect(collect(messages));
    live.observe(snapshot(0));
    live.observe(snapshot(1, [makeFinding(), makeFinding({ symbol: 'useTotal' })]));
    const last = messages.at(-1);
    expect(last?.event).toBe('snapshot');
    if (last?.event === 'snapshot') {
      expect(last.data.delta.added).toHaveLength(1);
      expect(last.data.delta.removed).toEqual([]);
      expect(last.data.newCount).toBe(1);
      expect(last.data.summary).toEqual({ errors: 2, warnings: 0 });
    }
  });

  it('clears new findings when the marker moves', () => {
    const live = new Live(target);
    const messages: LiveMessage[] = [];
    live.connect(collect(messages));
    live.observe(snapshot(0, []));
    const later = snapshot(1);
    live.observe(later);
    expect(live.keysOf(later).isNew).toEqual([true]);
    live.resetMarker();
    expect(live.marker).toBe(1);
    expect(live.keysOf(later).isNew).toEqual([false]);
    expect(messages.at(-1)).toMatchObject({
      event: 'snapshot',
      data: { marker: 1, newCount: 0, delta: { added: [], removed: [] } },
    });
  });
});
