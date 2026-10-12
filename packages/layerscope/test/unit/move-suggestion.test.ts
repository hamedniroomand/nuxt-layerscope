import { describe, expect, it } from 'vite-plus/test';

import { addSuggestions } from '#src/suggest/index.ts';
import type { Edge, Finding, LayerscopeConfig } from '#src/types.ts';
import { makeEdge, makeFinding, makeLayer } from '#test/factories.ts';

const layers = ['admin', 'shop', 'web', 'shared'].map(name => makeLayer(name, `/app/${name}`));
const FILE = '/app/web/composables/useX.ts';

const config: LayerscopeConfig = {
  layers: {
    web: { allow: ['shared'] },
    admin: { allow: ['shared'] },
    shop: { allow: ['shared'] },
    shared: { allow: [] },
  },
};

const use = (fromLayer: string): Edge =>
  makeEdge({
    symbol: 'useX',
    fromLayer,
    toLayer: 'web',
    to: FILE,
    file: `/app/${fromLayer}/a.ts`,
  });

const finding = (fromLayer: string, overrides: Partial<Finding> = {}): Finding =>
  makeFinding({
    symbol: 'useX',
    fromLayer,
    toLayer: 'web',
    target: FILE,
    file: `/app/${fromLayer}/a.ts`,
    ...overrides,
  });

describe('the message of a move', () => {
  it('says which layers may depend on the target, without a count that mixes the owner in', async () => {
    const [first] = await addSuggestions(
      [finding('admin'), finding('shop')],
      [use('admin'), use('shop')],
      layers,
      config,
      '/app',
    );
    expect(first.suggestion?.message).toBe(
      'move it to layer "shared", which each of the 2 layers that use it may depend on (2 files use it, 0 imports to update, clears 2 findings)',
    );
  });
});

describe('the findings a move clears', () => {
  it('counts only boundary and internal findings of the file', async () => {
    const findings = [
      finding('admin'),
      finding('shop'),
      finding('shop', { rule: 'shadowed-component' }),
      finding('shop', { rule: 'layer-cycle' }),
    ];
    const [first] = await addSuggestions(
      findings,
      [use('admin'), use('shop')],
      layers,
      config,
      '/app',
    );
    expect(first.suggestion?.impact.fixes).toBe(2);
    expect(first.suggestion?.message).toContain('clears 2 findings');
  });
});

describe('the imports a move edits', () => {
  it('counts the imports of the users and the imports in the moved file', async () => {
    const edges = [
      makeEdge({
        kind: 'import',
        symbol: '../web/composables/useX',
        fromLayer: 'admin',
        toLayer: 'web',
        to: FILE,
        file: '/app/admin/a.ts',
      }),
      makeEdge({
        kind: 'import',
        symbol: '#imports:useX',
        fromLayer: 'shop',
        toLayer: 'web',
        to: FILE,
        file: '/app/shop/a.ts',
      }),
      makeEdge({
        kind: 'import',
        symbol: './helper',
        fromLayer: 'web',
        toLayer: 'web',
        to: '/app/web/composables/helper.ts',
        file: FILE,
      }),
    ];
    const [first] = await addSuggestions(
      [finding('admin'), finding('shop')],
      edges,
      layers,
      { layers: { ...config.layers, shared: { allow: ['web'] } } },
      '/app',
    );
    // The helper stays in web, which shared may use, so its path changes. A `#imports:` symbol is not text.
    expect(first.suggestion?.impact.imports).toBe(2);
  });
});

describe('the layers in the message of a move', () => {
  it('does not count the owner layer when it uses its own file', async () => {
    const [first] = await addSuggestions(
      [finding('admin'), finding('shop')],
      [use('admin'), use('shop'), use('web')],
      layers,
      config,
      '/app',
    );
    expect(first.suggestion?.message).toContain('each of the 2 layers that use it');
    expect(first.suggestion?.message).toContain('3 files use it');
  });

  it('says "its user" for one layer, and "uses" for one file', async () => {
    const [first] = await addSuggestions(
      [finding('admin')],
      [use('admin'), use('web')],
      layers,
      { layers: { ...config.layers, web: { allow: ['shared', 'admin'] } } },
      '/app',
    );
    expect(first.suggestion?.message).toContain('which its user may depend on');
    expect(first.suggestion?.message).toContain('2 files use it');
  });
});

describe('a target with its own import dirs', () => {
  it('is not a target, as layerscope does not know what it scans', async () => {
    const own = layers.map(layer =>
      layer.name === 'shared' ? { ...layer, defaultImports: false } : layer,
    );
    const findings = [finding('admin'), finding('shop')];
    const edges = [use('admin'), use('shop')];
    const [first] = await addSuggestions(findings, edges, own, config, '/app');
    // Auto-imports need the default dirs, so no layer fits and the suggestion is not a move.
    expect(first.suggestion?.action).not.toBe('move');
    const [normal] = await addSuggestions(findings, edges, layers, config, '/app');
    expect(normal.suggestion?.action).toBe('move');
  });
});
