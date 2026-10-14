// @vitest-environment happy-dom
import type { VueWrapper } from '@vue/test-utils';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { TraceView } from '#contract';
import { mountApp } from '#test/mount.ts';

let mounted: VueWrapper | undefined;

beforeEach(() => {
  window.location.hash = '';
  sessionStorage.clear();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

/** `Pair` has a file in `shop` and a file in `shared`; one use reaches both. */
const pairTrace = {
  version: 1,
  symbol: 'Pair',
  targets: [
    ['layers/shop/Pair.client.vue', 'shop', 'not-allowed'],
    ['layers/shared/Pair.server.vue', 'shared', 'allowed'],
  ].map(([file, layer, status]) => ({
    symbol: 'Pair',
    file,
    layer,
    external: null,
    uses: [
      {
        file: 'auth/Box.vue',
        absFile: '/app/auth/Box.vue',
        line: 1,
        column: 20,
        kind: 'component',
        symbol: 'Pair',
        fromLayer: 'auth',
        toLayer: layer,
        status,
      },
    ],
  })),
} as TraceView;

describe('trace view of a component with more than one file', () => {
  it('shows one row for each file of the same use, with its file', async () => {
    window.location.hash = '#/trace';
    const { wrapper, api } = await mountApp();
    mounted = wrapper;
    vi.mocked(api.trace).mockResolvedValue(pairTrace);
    window.location.hash = '#/trace/Pair';
    globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
    await flushPromises();
    expect(api.trace).toHaveBeenLastCalledWith('Pair');
    const rows = wrapper.findAll('.uses li').map(row => row.text());
    expect(rows).toEqual([
      expect.stringMatching(
        /auth\/Box\.vue:1:20\s*→ layers\/shop\/Pair\.client\.vue\s*✖ not allowed/u,
      ),
      expect.stringMatching(
        /auth\/Box\.vue:1:20\s*→ layers\/shared\/Pair\.server\.vue\s*✔ allowed/u,
      ),
    ]);
    // The Vue key of each row: the same key for two rows makes Vue patch the wrong row.
    const keys = wrapper
      .findAll('.uses li')
      .map(row => (row.element as unknown as { __vnode?: { key: unknown } }).__vnode?.key);
    expect(new Set(keys).size).toBe(2);
  });
});
