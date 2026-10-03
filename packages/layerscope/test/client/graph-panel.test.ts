// @vitest-environment happy-dom
import type { VueWrapper } from '@vue/test-utils';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { edgeView, graphView, nodeView } from '#src/devtools/graph-api.ts';
import { mountApp, press } from '#test/client/mount.ts';
import { makeEdge, makeLayer, makeResult } from '#test/factories.ts';

let mounted: VueWrapper | undefined;

beforeEach(() => {
  window.location.hash = '';
  sessionStorage.clear();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

/** Two layers; `web` has 250 files, more than one page of the side panel. */
function result(): ReturnType<typeof makeResult> {
  return makeResult({
    layers: [makeLayer('web', '/app'), makeLayer('shop', '/app/layers/shop')],
    files: Array.from({ length: 250 }, (_, index) => `/app/pages/p${index}.vue`),
    edges: [makeEdge()],
  });
}

async function mountGraph(): Promise<Awaited<ReturnType<typeof mountApp>>> {
  window.location.hash = '#/graph';
  const mountedApp = await mountApp();
  vi.mocked(mountedApp.api.graph).mockResolvedValue(await graphView(result()));
  vi.mocked(mountedApp.api.node).mockImplementation(async (layer, offset) => {
    const view = await Promise.resolve(nodeView(result(), layer, offset));
    if (view === null) {
      throw new Error(`no layer ${layer}`);
    }
    return view;
  });
  // Leave and come back, so the view fetches with the mocks in place.
  press('1');
  await flushPromises();
  press('5');
  await vi.dynamicImportSettled();
  await flushPromises();
  mounted = mountedApp.wrapper;
  return mountedApp;
}

describe('graph side panel', () => {
  it('pages through the files of a layer', async () => {
    const { wrapper, api } = await mountGraph();
    await wrapper.get('.node[data-id="web"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('.panel li a.mono')).toHaveLength(200);
    const more = wrapper.findAll('.panel button').find(button => button.text() === 'Show more');
    await more?.trigger('click');
    await flushPromises();
    expect(api.node).toHaveBeenLastCalledWith('web', 200);
    expect(wrapper.findAll('.panel li a.mono')).toHaveLength(250);
    expect(wrapper.findAll('.panel button').map(button => button.text())).not.toContain(
      'Show more',
    );
  });

  it('shows the error of a failed load, and loads again on Retry', async () => {
    const { wrapper, api } = await mountGraph();
    vi.mocked(api.edge).mockRejectedValue(new Error('edge failed'));
    await wrapper.get('.edge').trigger('click');
    await flushPromises();
    expect(wrapper.get('.panel [role="alert"]').text()).toContain('edge failed');
    vi.mocked(api.edge).mockResolvedValue(edgeView(result(), 'web', 'shop'));
    await wrapper.get('.panel [role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('.panel [role="alert"]').exists()).toBe(false);
    expect(wrapper.get('.panel').text()).toContain('useCart');
  });
});
