// @vitest-environment happy-dom
import type { VueWrapper } from '@vue/test-utils';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import App from '#src/devtools/client/App.vue';
import type { Api } from '#src/devtools/client/lib/api.ts';
import { ApiError } from '#src/devtools/client/lib/api.ts';
import { createTabContext } from '#src/devtools/client/lib/app.ts';
import { TAB_CONTEXT } from '#src/devtools/client/lib/context.ts';
import { createNavigation } from '#src/devtools/client/lib/navigation.ts';
import type { ReportResponse } from '#src/devtools/protocol.ts';
import { THEME_SCRIPT } from '#src/devtools/shell.ts';
import { reportResponse, sampleFindings } from '#test/client/fixtures.ts';

interface Mounted {
  wrapper: VueWrapper;
  api: Api;
}

function fakeApi(data: ReportResponse | Error): Api {
  const report = vi.fn<Api['report']>();
  if (data instanceof Error) {
    report.mockRejectedValue(data);
  } else {
    report.mockResolvedValue({ data, etag: '"a-0"' });
  }
  return {
    report,
    rerun: vi.fn<Api['rerun']>().mockResolvedValue(data instanceof Error ? reportResponse() : data),
    openInEditor: vi.fn<Api['openInEditor']>().mockResolvedValue(),
  };
}

async function mountApp(data: ReportResponse | Error = reportResponse()): Promise<Mounted> {
  const api = fakeApi(data);
  const wrapper = mount(App, {
    attachTo: document.body,
    global: { provide: { [TAB_CONTEXT as symbol]: createTabContext(window, api) } },
  });
  await flushPromises();
  return { wrapper, api };
}

function press(key: string): void {
  globalThis.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

function withFindings(): ReportResponse {
  const findings = sampleFindings();
  return reportResponse({
    findings,
    summary: { files: 3, errors: 2, warnings: 1 },
    hotFiles: [
      { file: 'pages/index.vue', absFile: '/app/pages/index.vue', errors: 1, warnings: 0 },
    ],
  });
}

let mounted: VueWrapper | undefined;

beforeEach(() => {
  window.location.hash = '';
  sessionStorage.clear();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

describe('tab shell', () => {
  it('lands on the overview and switches views with the tab bar and number keys', async () => {
    const { wrapper } = await mountApp(withFindings());
    mounted = wrapper;
    expect(wrapper.text()).toContain('2 errors');
    expect(wrapper.text()).toContain('Hot files');
    await wrapper.findAll('[role="tab"]')[1]?.trigger('click');
    expect(window.location.hash).toBe('#/findings');
    press('3');
    await flushPromises();
    expect(window.location.hash).toBe('#/layers');
    expect(wrapper.find('table').exists()).toBe(true);
  });

  it('shows the empty state when nothing is found', async () => {
    const { wrapper } = await mountApp();
    mounted = wrapper;
    expect(wrapper.text()).toContain('No findings. The architecture matches the rules.');
  });

  it('shows the analysis error with a retry', async () => {
    const { wrapper, api } = await mountApp(new ApiError(500, 'config is broken'));
    mounted = wrapper;
    expect(wrapper.get('[role="alert"]').text()).toContain('config is broken');
    await wrapper.get('[role="alert"] button').trigger('click');
    expect(api.rerun).toHaveBeenCalled();
  });

  it('keeps the last data and shows a banner when the server is gone', async () => {
    const { wrapper } = await mountApp(new TypeError('Failed to fetch'));
    mounted = wrapper;
    expect(wrapper.text()).toContain('The dev server does not answer');
  });
});

describe('findings view', () => {
  it('filters through chips that update the hash', async () => {
    window.location.hash = '#/findings';
    const { wrapper } = await mountApp(withFindings());
    mounted = wrapper;
    expect(wrapper.findAll('li.row')).toHaveLength(3);
    const warnChip = wrapper.findAll('.chip').find(chip => chip.text().startsWith('warn'));
    await warnChip?.trigger('click');
    expect(window.location.hash).toBe('#/findings?sev=warn');
    expect(wrapper.findAll('li.row')).toHaveLength(1);
  });

  it('opens filtered findings from an overview count', async () => {
    const { wrapper } = await mountApp(withFindings());
    mounted = wrapper;
    await wrapper.get('.counts a').trigger('click');
    expect(window.location.hash).toBe('#/findings?sev=error');
    expect(wrapper.findAll('li.row')).toHaveLength(2);
  });

  it('moves the selection with j and k and opens it with o', async () => {
    window.location.hash = '#/findings';
    const { wrapper, api } = await mountApp(withFindings());
    mounted = wrapper;
    press('j');
    press('j');
    press('k');
    await flushPromises();
    const selected = wrapper.findAll('li.row.selected');
    expect(selected).toHaveLength(1);
    expect(selected[0]?.text()).toContain('useCart');
    press('o');
    expect(api.openInEditor).toHaveBeenCalledWith('/app/pages/index.vue', 3, 5);
  });

  it('focuses the filter with / from any view and ignores keys typed into it', async () => {
    const { wrapper } = await mountApp(withFindings());
    mounted = wrapper;
    press('/');
    await flushPromises();
    const search = wrapper.get('input[type="search"]');
    expect(document.activeElement).toBe(search.element);
    search.element.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
    expect(window.location.hash).toBe('#/findings');
  });
});

describe('navigation', () => {
  it('replaces the hash, so the host app history does not grow', () => {
    const nav = createNavigation(window);
    const length = history.length;
    nav.open('findings', { sev: ['error'] });
    nav.open('layers');
    expect(window.location.hash).toBe('#/layers?sev=error');
    expect(history.length).toBe(length);
  });

  it('restores the last hash from session storage', () => {
    sessionStorage.setItem('layerscope:hash', '#/layers');
    const nav = createNavigation(window);
    expect(nav.route.value.view).toBe('layers');
    expect(window.location.hash).toBe('#/layers');
  });
});

describe('theme script', () => {
  it('sets a theme class from the OS when DevTools is absent', () => {
    document.documentElement.className = '';
    // eslint-disable-next-line typescript/no-implied-eval, typescript/no-unsafe-call -- runs the inline script as the browser does
    new Function(THEME_SCRIPT)();
    expect(['dark', 'light']).toContain(document.documentElement.className);
  });
});
