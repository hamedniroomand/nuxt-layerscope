// @vitest-environment happy-dom
import type { VueWrapper } from '@vue/test-utils';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { mountApp, withFindings } from '#test/client/mount.ts';

let mounted: VueWrapper | undefined;

beforeEach(() => {
  window.location.hash = '#/findings';
  sessionStorage.clear();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  vi.useRealTimers();
});

async function mountFindings(): Promise<VueWrapper> {
  const { wrapper } = await mountApp(withFindings());
  mounted = wrapper;
  return wrapper;
}

describe('findings text filter', () => {
  it('writes the text to the hash after a short pause', async () => {
    vi.useFakeTimers();
    const wrapper = await mountFindings();
    await wrapper.get('input.search').setValue('car');
    await wrapper.get('input.search').setValue('cart');
    expect(window.location.hash).not.toContain('q=');
    vi.advanceTimersByTime(200);
    await flushPromises();
    expect(window.location.hash).toBe('#/findings?q=cart');
  });

  it('takes the text from the hash when the hash changes elsewhere', async () => {
    const wrapper = await mountFindings();
    window.location.hash = '#/findings?q=shop';
    globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
    await flushPromises();
    expect((wrapper.get('input.search').element as HTMLInputElement).value).toBe('shop');
  });
});

describe('findings grouping and rule chips', () => {
  it('groups by the selected value and ignores an unknown one', async () => {
    const wrapper = await mountFindings();
    await wrapper.get('.controls select').setValue('file');
    await flushPromises();
    expect(window.location.hash).toBe('#/findings?group=file');
    const select = wrapper.get('.controls select').element as HTMLSelectElement;
    select.innerHTML += '<option value="bogus">bogus</option>';
    await wrapper.get('.controls select').setValue('bogus');
    await flushPromises();
    expect(window.location.hash).toBe('#/findings?group=file');
  });

  it('toggles a rule filter from its chip', async () => {
    const wrapper = await mountFindings();
    const chip = wrapper.findAll('.chip').find(item => item.text().startsWith('layer-boundary'));
    await chip?.trigger('click');
    await flushPromises();
    expect(window.location.hash).toBe('#/findings?rule=layer-boundary');
    await chip?.trigger('click');
    await flushPromises();
    expect(window.location.hash).toBe('#/findings');
  });
});
