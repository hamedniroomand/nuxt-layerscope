// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vite-plus/test';
import { defineComponent, h, ref } from 'vue';

import { createTabContext } from '#src/devtools/client/lib/app.ts';
import { useLive } from '#src/devtools/client/lib/live-view.ts';
import type { EventSourceLike } from '#src/devtools/client/lib/live.ts';
import type { FrameElement, FrameWindow } from '#src/devtools/client/lib/visibility.ts';
import { watchVisibility } from '#src/devtools/client/lib/visibility.ts';
import { fakeApi } from '#test/client/mount.ts';

/** The DevTools frame around the tab: a real element whose inline style decides visibility. */
function hostWith(element: HTMLElement): FrameWindow {
  const frame: FrameElement = {
    checkVisibility: () => element.style.visibility !== 'hidden',
    getRootNode: () => document,
  };
  const top = { document, frameElement: null } as unknown as FrameWindow & { parent: FrameWindow };
  top.parent = top;
  return { document, frameElement: frame, parent: top } as unknown as FrameWindow;
}

describe('visibility watcher', () => {
  it('reports when a frame is hidden and shown again', async () => {
    const element = document.createElement('iframe');
    document.body.append(element);
    const changes: boolean[] = [];
    const stop = watchVisibility(hostWith(element), visible => {
      changes.push(visible);
    });
    element.style.visibility = 'hidden';
    await flushPromises();
    element.style.visibility = 'visible';
    await flushPromises();
    stop();
    element.style.visibility = 'hidden';
    await flushPromises();
    expect(changes).toEqual([false, true]);
  });
});

describe('live connection and visibility', () => {
  it('closes the stream while hidden and reconnects and reloads when shown', async () => {
    const element = document.createElement('iframe');
    document.body.append(element);
    const sources: { closed: boolean }[] = [];
    const open = (): EventSourceLike => {
      const source = { closed: false };
      sources.push(source);
      return {
        addEventListener: vi.fn<EventSourceLike['addEventListener']>(),
        close: () => {
          source.closed = true;
        },
        onopen: null,
        onerror: null,
      };
    };
    const api = fakeApi(new Error('not loaded'));
    const context = createTabContext(window, api);
    const Probe = defineComponent({
      setup: () => {
        const live = useLive(context, ref(null), { open, host: hostWith(element) });
        return (): ReturnType<typeof h> => h('span', live.status.value ?? 'none');
      },
    });
    const wrapper = mount(Probe);
    await flushPromises();
    expect(sources).toHaveLength(1);
    expect(wrapper.text()).toBe('connecting');
    element.style.visibility = 'hidden';
    await flushPromises();
    expect(sources[0]?.closed).toBe(true);
    expect(wrapper.text()).toBe('none');
    element.style.visibility = 'visible';
    await flushPromises();
    expect(sources).toHaveLength(2);
    expect(vi.mocked(api.report)).toHaveBeenCalledOnce();
    wrapper.unmount();
    expect(sources[1]?.closed).toBe(true);
  });
});
