// @vitest-environment happy-dom
import type { VueWrapper } from '@vue/test-utils';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { ApiError } from '#src/devtools/client/lib/api.ts';
import { createNavigation } from '#src/devtools/client/lib/navigation.ts';
import { THEME_SCRIPT } from '#src/devtools/shell.ts';
import { mountApp, press, withFindings } from '#test/client/mount.ts';

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
    press('6');
    await flushPromises();
    expect(window.location.hash).toBe('#/baseline');
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
    nav.open('graph');
    expect(window.location.hash).toBe('#/graph?sev=error');
    expect(history.length).toBe(length);
  });

  it('restores the last hash from session storage', () => {
    sessionStorage.setItem('layerscope:hash', '#/unused');
    const nav = createNavigation(window);
    expect(nav.route.value.view).toBe('unused');
    expect(window.location.hash).toBe('#/unused');
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
