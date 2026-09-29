import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { formatResult } from '#src/report/index.ts';
import { NUXT3_ROOT, NUXT4_ROOT } from '#test/fixtures.ts';

describe.each([
  ['nuxt 3', NUXT3_ROOT],
  ['nuxt 4', NUXT4_ROOT],
])('registry and .d.ts fallback (%s)', (_label, root) => {
  const fromRegistry = analyze({ rootDir: root, source: 'registry' });
  const fromTypes = analyze({ rootDir: root, source: 'types' });

  it('reads the registry written by the Nuxt module by default', async () => {
    const auto = await analyze({ rootDir: root });
    expect(auto.source).toBe('registry');
    expect(auto.sourceFile).toBe(`${root}/.nuxt/layerscope/registry.json`);
  });

  it('produces identical findings', async () => {
    const [registry, types] = await Promise.all([fromRegistry, fromTypes]);
    expect(types.source).toBe('types');
    expect(registry.findings).toEqual(types.findings);
    expect(formatResult(registry, 'text', root)).toBe(formatResult(types, 'text', root));
  });

  it('produces identical edges and layers', async () => {
    const [registry, types] = await Promise.all([fromRegistry, fromTypes]);
    expect(registry.layers).toEqual(types.layers);
    expect(registry.edges.map(edge => [edge.symbol, edge.to, edge.toLayer])).toEqual(
      types.edges.map(edge => [edge.symbol, edge.to, edge.toLayer]),
    );
  });

  it('says that shadowed-component needs the registry', async () => {
    const [registry, types] = await Promise.all([fromRegistry, fromTypes]);
    expect(registry.notes).toEqual([]);
    expect(types.notes).toEqual([expect.stringContaining('shadowed-component needs')]);
  });
});
