// @vitest-environment happy-dom
import type { VueWrapper } from '@vue/test-utils';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import App from '#src/devtools/client/App.vue';
import { createTabContext } from '#src/devtools/client/lib/app.ts';
import { TAB_CONTEXT } from '#src/devtools/client/lib/context.ts';
import { createDemoApi } from '#src/devtools/client/lib/demo-api.ts';
import { withFindings } from '#test/client/mount.ts';

const BASE = '/__layerscope';
let mounted: VueWrapper | undefined;
let urls: string[] = [];
const events = vi.fn();

beforeEach(() => {
  window.location.hash = '#/findings';
  urls = [];
  vi.stubGlobal('EventSource', events);
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  vi.unstubAllGlobals();
  events.mockClear();
});

/** The tab over a snapshot of `withFindings()`, served as files. */
async function mountDemo(): Promise<{ wrapper: VueWrapper; keys: string[] }> {
  const report = withFindings();
  const files: Record<string, unknown> = {
    [`${BASE}/api/report.json`]: report,
    [`${BASE}/api/state.json`]: { ...report, report: undefined, version: '0.2.0' },
  };
  const request = vi.fn<typeof fetch>(async input => {
    const url = input instanceof Request ? input.url : input.toString();
    urls.push(url);
    const body = files[url];
    const response = await Promise.resolve(
      new Response(JSON.stringify(body ?? {}), { status: body === undefined ? 404 : 200 }),
    );
    return response;
  });
  const config = { base: BASE, openInEditor: '', token: '', demo: true };
  const context = createTabContext(window, createDemoApi(config, request), true);
  const wrapper = mount(App, {
    attachTo: document.body,
    global: { provide: { [TAB_CONTEXT as symbol]: context } },
  });
  await flushPromises();
  mounted = wrapper;
  return { wrapper, keys: context.shortcuts.list().map(shortcut => shortcut.key) };
}

describe('demo mode', () => {
  it('shows the snapshot banner and no live or write control', async () => {
    const { wrapper } = await mountDemo();
    const text = wrapper.text();
    expect(text).toMatch(/Snapshot from .+ · nuxt-layerscope 0\.2\.0\. Read-only\./u);
    const buttons = wrapper.findAll('button').map(button => button.text());
    for (const control of ['Re-run', 'Pause', 'Ignore', 'Open', 'Undo']) {
      expect(buttons, control).not.toContain(control);
    }
    expect(buttons.some(label => label.startsWith('Ignore all'))).toBe(false);
    expect(buttons).toContain('Dark theme');
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
    expect(text).not.toContain('New only');
    expect(wrapper.findAll('.row a')).toHaveLength(0);
    expect(wrapper.findAll('.row span.mono').length).toBeGreaterThan(0);
  });

  it('opens no event stream, polls nothing, and lists only the keys that work', async () => {
    const { keys } = await mountDemo();
    expect(events).not.toHaveBeenCalled();
    expect(urls.filter(url => url.includes('/events'))).toEqual([]);
    expect(urls.filter(url => url.includes('state'))).toEqual([`${BASE}/api/state.json`]);
    for (const key of ['r', 'p', 'i', 'x', 'o', 'n']) {
      expect(keys, key).not.toContain(key);
    }
    expect(keys).toEqual(expect.arrayContaining(['1', '/', 'j', 'k', 't', 'Escape']));
  });

  it('toggles the theme and keeps the choice', async () => {
    const { wrapper } = await mountDemo();
    const button = wrapper.findAll('button').find(item => item.text() === 'Dark theme');
    const before = document.documentElement.classList.contains('dark');
    await button?.trigger('click');
    expect(document.documentElement.classList.contains('dark')).toBe(!before);
    expect(localStorage.getItem('layerscope-theme')).toBe(before ? 'light' : 'dark');
  });
});
