import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { loadConfig } from '#src/config/load.ts';
import { buildGraph } from '#src/graph/index.ts';
import { formatGraph } from '#src/report/graph/index.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

const config = await loadConfig(NUXT4_ROOT);
const result = await analyze({ rootDir: NUXT4_ROOT, config });

describe('buildGraph by layer', () => {
  const graph = buildGraph(result, config, 'layer');

  it('lists every layer, including ones without edges', () => {
    expect(graph.nodes.map(node => node.id)).toEqual(result.layers.map(layer => layer.name));
  });

  it('aggregates references and keeps the worst status', () => {
    expect(graph.edges.find(edge => edge.from === 'admin' && edge.to === 'web')).toEqual({
      from: 'admin',
      to: 'web',
      count: 4,
      status: 'not-allowed',
    });
    expect(graph.edges.find(edge => edge.from === 'auth' && edge.to === 'shared')?.status).toBe(
      'allowed',
    );
  });

  it('leaves out edges within a layer and to packages', () => {
    expect(graph.edges.every(edge => edge.from !== edge.to)).toBe(true);
  });

  it.each(['mermaid', 'dot', 'json'] as const)('prints %s', async format => {
    await expect(formatGraph(graph, format)).toMatchFileSnapshot(
      `snapshots/graph/nuxt4-layer.${format}`,
    );
  });
});

describe('buildGraph by file', () => {
  const graph = buildGraph(result, config, 'file');

  it('groups files by layer with paths relative to the root', () => {
    expect(graph.nodes).toContainEqual({ id: 'app/pages/index.vue', layer: 'root' });
    expect(graph.edges).toContainEqual({
      from: 'layers/admin/app/utils/exportCsv.ts',
      to: 'layers/web/app/composables/useCart.ts',
      count: 1,
      status: 'not-allowed',
    });
  });

  it('prints mermaid with a subgraph per layer', async () => {
    await expect(formatGraph(graph, 'mermaid')).toMatchFileSnapshot(
      'snapshots/graph/nuxt4-file.mermaid',
    );
  });
});
