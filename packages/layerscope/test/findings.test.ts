import { join, relative } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { REGISTRY_ONLY_RULES } from '#src/config/rules.ts';
import { readRegistry } from '#src/registry/read.ts';
import type { AnalyzeResult, Finding } from '#src/types.ts';
import { compareStrings } from '#src/utils/strings.ts';
import { MATRIX_ROOT, NUXT3_ROOT, NUXT4_ROOT } from '#test/fixtures.ts';

/** Paths as `layer:path`, so the snapshot does not depend on where pnpm puts packages. */
function layerPath(file: string, layerName: string | null, result: AnalyzeResult): string {
  const layer = result.layers.find(candidate => candidate.name === layerName);
  return layer === undefined ? file : `${layerName}:${relative(layer.root, file)}`;
}

function describeTarget(finding: Finding, result: AnalyzeResult): string {
  return finding.target === null ? '' : ` → ${layerPath(finding.target, finding.toLayer, result)}`;
}

/** The names of the island components in the registry of the fixture. */
function islandNames(root: string): Set<string> {
  const read = readRegistry(join(root, '.nuxt'));
  const components = read.kind === 'ok' ? read.registry.components : [];
  return new Set(components.filter(c => c.island).map(c => c.name));
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

  it('are the same from the .d.ts fallback, except for the shadowed-* rules and island components', async () => {
    const [registry, types] = await Promise.all([
      analyze({ rootDir: root, source: 'registry' }),
      analyze({ rootDir: root, source: 'types' }),
    ]);
    // The .d.ts files do not list island components, so only the registry finds a use in
    // `<NuxtIsland name>`. Its suggestions count that use, so they are not compared then.
    const islands = islandNames(root);
    const hasIsland = registry.findings.some(f => islands.has(f.symbol));
    const comparable = (f: Finding): Finding => (hasIsland ? { ...f, suggestion: undefined } : f);
    const expected = registry.findings.filter(
      f => !REGISTRY_ONLY_RULES.includes(f.rule) && !islands.has(f.symbol),
    );
    expect(types.findings.map(f => comparable(f))).toEqual(expected.map(f => comparable(f)));
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
    // `Pair` has its own test: the order of its two files changes with the Nuxt release.
    const components = edges.filter(
      e => e.kind === 'component' && e.file.endsWith('ShopPanel.vue') && e.symbol !== 'Pair',
    );
    expect(components.map(e => [e.symbol, e.toLayer])).toEqual([
      ['BaseCard', 'theme'],
      ['FlatThing', 'base'],
      ['WChart', 'base'],
      // `Clock.client.vue` and `Clock.server.vue`.
      ['Clock', 'theme'],
      ['Clock', 'theme'],
      ['NpmBadge', 'npm'],
      ['NuxtIsland', null],
      // `<NuxtIsland name="Weather">`.
      ['Weather', 'theme'],
    ]);
  });
});

describe('shared utils of the matrix fixture', () => {
  it('resolves shared utils in app, server and shared code', async () => {
    const uses = (await analyze({ rootDir: MATRIX_ROOT })).edges.filter(
      e => e.symbol === 'formatMoney',
    );
    expect(uses.map(e => [relative(MATRIX_ROOT, e.file), e.toLayer])).toEqual([
      ['layers/shop/app/components/ShopPanel.vue', 'base'],
      ['layers/shop/server/api/total.get.ts', 'base'],
      ['layers/shop/shared/utils/label.ts', 'base'],
    ]);
  });
});

describe('a component name with files in two layers of the matrix fixture', () => {
  // `theme` has `Pair.client.vue` and `base` has `Pair.server.vue`. Nuxt keeps both: the browser
  // uses the `theme` file and the server uses the `base` file. `shop` may use only `base`.
  it.each(['registry', 'types'] as const)(
    'checks a use of a component against each of its files (%s)',
    async source => {
      const { edges, findings } = await analyze({ rootDir: MATRIX_ROOT, source });
      const pair = edges.filter(e => e.symbol === 'Pair');
      const files = pair.map(e => [relative(MATRIX_ROOT, e.to ?? ''), e.toLayer ?? '']);
      expect(files.toSorted((a, b) => compareStrings(a[0], b[0]))).toEqual([
        ['layers/base/app/components/Pair.server.vue', 'base'],
        ['layers/theme/app/components/Pair.client.vue', 'theme'],
      ]);
      const found = findings.filter(f => f.symbol === 'Pair');
      expect(found.map(f => [f.rule, f.fromLayer, f.toLayer])).toEqual([
        ['layer-boundary', 'shop', 'theme'],
      ]);
    },
  );
});

describe('the overridden pages of the matrix fixture', () => {
  // The messages are not in the snapshot. They name a route that Nuxt makes, so this checks that
  // each Nuxt release in CI gives the module the routes in the same form.
  it('names the route of a page that Nuxt makes one route from', async () => {
    const { findings } = await analyze({ rootDir: MATRIX_ROOT, source: 'registry' });
    const pages = findings.filter(f => f.rule === 'shadowed-page');
    expect(pages.map(f => f.message)).toEqual([
      'Page "index" (route /) of layer "base" is overridden by layer "root"',
      'Page "shop/[id]" (route /shop/:id()) of layer "base" is overridden by layer "root"',
    ]);
  });
});

describe('the overridden auto-imports of the matrix fixture', () => {
  // A composable in the source dir of a layer has the priority of the layer, so root wins. A
  // shared util has no layer priority, so the later file wins: the one of `base`.
  it('reports the file that Nuxt does not use, as unimport picks the winner', async () => {
    const { findings } = await analyze({ rootDir: MATRIX_ROOT, source: 'registry' });
    const overridden = findings.filter(f => f.rule === 'shadowed-auto-import');
    expect(overridden.map(f => [relative(MATRIX_ROOT, f.file), f.message])).toEqual([
      [
        'layers/base/app/composables/useTheme.ts',
        'Auto-import "useTheme" of layer "base" is overridden by layer "root"',
      ],
      [
        'shared/utils/formatDate.ts',
        'Auto-import "formatDate" of layer "root" is overridden by layer "base"',
      ],
    ]);
  });
});
