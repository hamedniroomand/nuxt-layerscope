// @vitest-environment happy-dom
import type { VueWrapper } from '@vue/test-utils';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { edgeView, graphView } from '#src/devtools/graph-api.ts';
import { mountApp, press } from '#test/client/mount.ts';
import { makeEdge, makeFinding, makeLayer, makeResult } from '#test/factories.ts';

let mounted: VueWrapper | undefined;

beforeEach(() => {
  window.location.hash = '';
  sessionStorage.clear();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

function result(layers = 2): ReturnType<typeof makeResult> {
  const names = ['web', 'shop', ...Array.from({ length: layers - 2 }, (_, index) => `l${index}`)];
  return makeResult({
    config: { layers: { web: { allow: [] } } },
    layers: names.map(name => makeLayer(name, name === 'web' ? '/app' : `/app/layers/${name}`)),
    edges: [makeEdge(), makeEdge({ symbol: 'CartBadge', kind: 'component' })],
    findings: [makeFinding()],
  });
}

async function mountGraph(layers = 2): Promise<Awaited<ReturnType<typeof mountApp>>> {
  window.location.hash = '#/graph';
  const mountedApp = await mountApp();
  vi.mocked(mountedApp.api.graph).mockResolvedValue(await graphView(result(layers)));
  vi.mocked(mountedApp.api.edge).mockResolvedValue(edgeView(result(layers), 'web', 'shop'));
  // Leave and come back, so the view fetches with the mocks in place.
  press('1');
  await flushPromises();
  press('5');
  await vi.dynamicImportSettled();
  await flushPromises();
  mounted = mountedApp.wrapper;
  return mountedApp;
}

describe('graph view', () => {
  it('draws the layers and marks the violating edge', async () => {
    const { wrapper } = await mountGraph();
    expect(wrapper.findAll('.node')).toHaveLength(2);
    const edge = wrapper.get('.edge');
    expect(edge.classes()).toContain('viol');
    expect(edge.text()).toContain('!1');
  });

  it('selects an edge into the hash and shows its symbols', async () => {
    const { wrapper, api } = await mountGraph();
    await wrapper.get('.edge').trigger('click');
    await flushPromises();
    expect(window.location.hash).toBe('#/graph/edge/web/shop');
    expect(api.edge).toHaveBeenCalledWith('web', 'shop');
    expect(wrapper.get('.panel').text()).toContain('useCart');
    press('Escape');
    await flushPromises();
    expect(window.location.hash).toBe('#/graph');
  });

  it('hides edges without violations on request', async () => {
    const { wrapper } = await mountGraph();
    await wrapper.get('select').setValue('5');
    expect(wrapper.findAll('.edge')).toHaveLength(0);
  });

  it('selects the same edge from the table view', async () => {
    const { wrapper } = await mountGraph();
    const table = wrapper.findAll('.seg button').find(button => button.text() === 'Table');
    await table?.trigger('click');
    const cell = wrapper.get('td[data-cell="0:1"]');
    expect(cell.classes()).toContain('v');
    await cell.trigger('click');
    expect(window.location.hash).toBe('#/graph/edge/web/shop');
  });

  it('opens on the table above 15 layers and fetches the layout for Graph mode', async () => {
    const { wrapper, api } = await mountGraph(16);
    expect(wrapper.find('table[role="grid"]').exists()).toBe(true);
    expect(api.graph).toHaveBeenLastCalledWith(false);
    vi.mocked(api.graph).mockResolvedValue(await graphView(result(16), true));
    const graphButton = wrapper.findAll('.seg button').find(button => button.text() === 'Graph');
    await graphButton?.trigger('click');
    await flushPromises();
    expect(api.graph).toHaveBeenLastCalledWith(true);
    expect(wrapper.findAll('.node')).toHaveLength(16);
  });
});

describe('graph keyboard', () => {
  it('leaves a field with the first Esc and clears the selection with the next', async () => {
    const { wrapper } = await mountGraph();
    await wrapper.get('.edge').trigger('click');
    const select = wrapper.get('select').element as HTMLSelectElement;
    select.focus();
    press('Escape');
    await flushPromises();
    expect(document.activeElement).not.toBe(select);
    expect(window.location.hash).toBe('#/graph/edge/web/shop');
    press('Escape');
    await flushPromises();
    expect(window.location.hash).toBe('#/graph');
  });

  it('keeps one tab stop on the nodes', async () => {
    const { wrapper } = await mountGraph();
    expect(wrapper.findAll('.node[tabindex="0"]')).toHaveLength(1);
  });
});

describe('overview mini graph', () => {
  it('draws the graph and opens the Graph view on a click', async () => {
    const { wrapper, api } = await mountApp();
    mounted = wrapper;
    vi.mocked(api.graph).mockResolvedValue(await graphView(result()));
    press('2');
    await flushPromises();
    press('1');
    await vi.dynamicImportSettled();
    await flushPromises();
    await wrapper.get('.canvas.still .node').trigger('click');
    expect(window.location.hash).toBe('#/graph/node/web');
  });
});
