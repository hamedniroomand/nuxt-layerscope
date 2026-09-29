import { relative } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import type { AnalyzeResult, Finding } from '#src/types.ts';
import { MATRIX_ROOT, NUXT3_ROOT, NUXT4_ROOT } from '#test/fixtures.ts';

/** Paths as `layer:path`, so the snapshot does not depend on where pnpm puts packages. */
function layerPath(file: string, layerName: string | null, result: AnalyzeResult): string {
  const layer = result.layers.find(candidate => candidate.name === layerName);
  return layer === undefined ? file : `${layerName}:${relative(layer.root, file)}`;
}

function describeTarget(finding: Finding, result: AnalyzeResult): string {
  return finding.target === null ? '' : ` → ${layerPath(finding.target, finding.toLayer, result)}`;
}

function snapshot(result: AnalyzeResult): string {
  const lines = result.findings.map(finding => {
    const file = layerPath(finding.file, finding.fromLayer, result);
    const position = `${file}:${finding.line}:${finding.column}`;
    const head = `${finding.severity} ${finding.rule} ${position} ${finding.symbol}`;
    return `${head} (${finding.fromLayer})${describeTarget(finding, result)}`;
  });
  return `${lines.join('\n')}\n`;
}

describe.each([
  ['nuxt3', NUXT3_ROOT],
  ['nuxt4', NUXT4_ROOT],
  ['matrix', MATRIX_ROOT],
])('expected findings of the %s fixture', (name, root) => {
  it('match the snapshot', async () => {
    const result = await analyze({ rootDir: root, source: 'registry' });
    await expect(snapshot(result)).toMatchFileSnapshot(`snapshots/findings/${name}.txt`);
  });

  it('are the same from the .d.ts fallback, except for shadowed components', async () => {
    const [registry, types] = await Promise.all([
      analyze({ rootDir: root, source: 'registry' }),
      analyze({ rootDir: root, source: 'types' }),
    ]);
    const withoutShadowed = registry.findings.filter(f => f.rule !== 'shadowed-component');
    expect(types.findings).toEqual(withoutShadowed);
  });
});

describe('matrix fixture', () => {
  const result = analyze({ rootDir: MATRIX_ROOT });

  it('names layers from npm and a remote git source', async () => {
    const { layers } = await result;
    // Nuxt 4.0 and later 4.x order `layers/*` differently, so only the set is stable.
    expect(layers.map(layer => layer.name).toSorted()).toEqual([
      'base',
      'npm',
      'remote',
      'root',
      'shop',
      'theme',
    ]);
    expect(layers.find(layer => layer.name === 'npm')?.root).toMatch(/\/node_modules\/\.pnpm\//u);
    expect(layers.find(layer => layer.name === 'remote')?.root).toMatch(/\/node_modules\/\.c12\//u);
  });

  it('resolves module-provided auto-imports as external', async () => {
    const edge = (await result).edges.find(e => e.symbol === 'useMouse');
    expect(edge).toMatchObject({ toLayer: null, external: '@vueuse/core' });
  });

  it('resolves components from custom dirs, with and without path prefix', async () => {
    const { edges } = await result;
    const components = edges.filter(
      e => e.kind === 'component' && e.file.endsWith('ShopPanel.vue'),
    );
    expect(components.map(e => [e.symbol, e.toLayer])).toEqual([
      ['BaseCard', 'theme'],
      ['FlatThing', 'base'],
      ['WChart', 'base'],
      ['Clock', 'theme'],
      ['NpmBadge', 'npm'],
      ['NuxtIsland', null],
    ]);
  });

  it('resolves shared utils in app, server and shared code', async () => {
    const uses = (await result).edges.filter(e => e.symbol === 'formatMoney');
    expect(uses.map(e => [relative(MATRIX_ROOT, e.file), e.toLayer])).toEqual([
      ['layers/shop/app/components/ShopPanel.vue', 'base'],
      ['layers/shop/server/api/total.get.ts', 'base'],
      ['layers/shop/shared/utils/label.ts', 'base'],
    ]);
  });
});
