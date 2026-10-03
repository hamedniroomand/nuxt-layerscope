// @vitest-environment happy-dom
import type { VueWrapper } from '@vue/test-utils';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { reportResponse, sampleFindings } from '#test/client/fixtures.ts';
import { mountApp, press } from '#test/client/mount.ts';

/** Stands in for the browser's EventSource; the test drives its events. */
class FakeSource {
  public static last: FakeSource | undefined;
  public onopen: ((event: Event) => unknown) | null = null;
  public onerror: ((event: Event) => unknown) | null = null;
  public readonly url: string;
  private readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();

  public constructor(url: string) {
    this.url = url;
    FakeSource.last = this;
  }

  public addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, listener);
  }

  public close(): void {
    this.listeners.clear();
  }

  public emit(type: string, data: unknown): void {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
}

let mounted: VueWrapper | undefined;

beforeEach(() => {
  window.location.hash = '';
  sessionStorage.clear();
  vi.stubGlobal('EventSource', FakeSource);
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  vi.unstubAllGlobals();
});

function snapshotEvent(rev: number, newCount: number): object {
  return {
    id: 'a',
    rev,
    marker: 0,
    analyzedAt: 0,
    durationMs: 3,
    summary: { errors: 1, warnings: 0 },
    delta: { added: [{ key: 'k', count: 1 }], removed: [] },
    newCount,
  };
}

describe('live status', () => {
  it('shows the stream state and pauses with p', async () => {
    const { wrapper, api } = await mountApp();
    mounted = wrapper;
    expect(FakeSource.last?.url).toBe('/__layerscope/events');
    FakeSource.last?.onopen?.(new Event('open'));
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toBe('live');
    press('p');
    await flushPromises();
    expect(api.live).toHaveBeenCalledWith('pause');
    expect(wrapper.get('[role="status"]').text()).toBe('paused');
    expect(wrapper.text()).toContain('Resume');
  });
});

describe('live findings', () => {
  it('refetches a changed report, shows the toast and the NEW chip', async () => {
    const { wrapper, api } = await mountApp();
    mounted = wrapper;
    const findings = sampleFindings(2);
    vi.mocked(api.report).mockResolvedValue({
      data: reportResponse({ findings, newCount: 1 }, 1),
      etag: '"a-1-0-0"',
    });
    FakeSource.last?.emit('snapshot', snapshotEvent(1, 1));
    await flushPromises();
    expect(api.report).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('+1 violation · 1 new since opened');
    const showNew = wrapper.findAll('button').find(button => button.text() === 'Show new');
    await showNew?.trigger('click');
    expect(window.location.hash).toBe('#/findings?new=1');
    expect(wrapper.findAll('li.row')).toHaveLength(1);
    expect(wrapper.get('li.row .new').text()).toBe('NEW');
  });

  it('jumps to the next new finding with n', async () => {
    window.location.hash = '#/findings';
    const findings = sampleFindings(1);
    const { wrapper } = await mountApp(reportResponse({ findings, newCount: 1 }));
    mounted = wrapper;
    press('n');
    await flushPromises();
    expect(wrapper.get('li.row.selected').text()).toContain('CartBadge');
  });

  it('does not refetch when only the time of the run changed', async () => {
    const { wrapper, api } = await mountApp();
    mounted = wrapper;
    FakeSource.last?.emit('snapshot', {
      ...snapshotEvent(0, 0),
      delta: { added: [], removed: [] },
    });
    await flushPromises();
    expect(api.report).toHaveBeenCalledOnce();
    expect(wrapper.text()).not.toContain('since opened');
  });
});
