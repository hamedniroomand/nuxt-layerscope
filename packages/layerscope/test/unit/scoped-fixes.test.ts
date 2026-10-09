import { describe, expect, it } from 'vite-plus/test';

import { allowHint } from '#src/devtools/hints.ts';
import { coversEdge } from '#src/rules/exposure.ts';
import { addSuggestions } from '#src/suggest/index.ts';
import type { Edge, Finding, LayerscopeConfig, Suggestion } from '#src/types.ts';
import { makeEdge, makeFinding, makeLayer, makeResult } from '#test/factories.ts';

const layers = ['admin', 'shop', 'web', 'shared'].map(name => makeLayer(name, `/app/${name}`));

describe('the hint for a whole layer', () => {
  it('replaces the scoped entry of that layer and keeps the other entries', () => {
    const config: LayerscopeConfig = {
      layers: { admin: { allow: ['shared', { layer: 'web', only: ['useCart'] }] } },
    };
    const suggestion: Suggestion = {
      action: 'allow',
      message: 'allow "admin" to use "web"',
      impact: { fixes: 4, edges: 1 },
    };
    const finding = makeFinding({ fromLayer: 'admin', toLayer: 'web', suggestion });
    const hint = allowHint(finding, makeResult({ config, findings: [finding] }));
    expect(hint?.snippet).toBe("layers: {\n  admin: { allow: ['shared', 'web'] },\n}");
  });

  it('counts only the boundary findings of the pair', () => {
    const suggestion: Suggestion = {
      action: 'allow',
      message: 'allow',
      impact: { fixes: 1, edges: 1 },
    };
    const boundary = makeFinding({
      fromLayer: 'admin',
      toLayer: 'web',
      file: '/app/a.vue',
      suggestion,
    });
    const internal = makeFinding({
      rule: 'layer-internal',
      fromLayer: 'admin',
      toLayer: 'web',
      file: '/app/b.vue',
    });
    const hint = allowHint(boundary, makeResult({ findings: [boundary, internal] }));
    expect(hint).toMatchObject({ files: 1, baselined: 0 });
  });
});

describe('the name of a file', () => {
  const edge = (file: string): Edge =>
    makeEdge({ kind: 'import', symbol: '~/x', names: ['default'], to: file });

  it('is the file name without its last extension only', () => {
    // `cart.item` is not an identifier, so only a glob can list it.
    expect(coversEdge(['cart'], edge('/l/app/composables/cart.item.ts'))).toBe(false);
    expect(
      coversEdge(['app/composables/cart.item.ts'], edge('/l/app/composables/cart.item.ts'), '/l'),
    ).toBe(true);
    expect(coversEdge(['useCart'], edge('/l/app/composables/useCart.ts'))).toBe(true);
  });

  it('leaves out the mode suffix of a component', () => {
    expect(coversEdge(['Foo'], edge('/l/app/components/Foo.client.vue'))).toBe(true);
    expect(coversEdge(['Foo'], edge('/l/app/components/Foo.server.vue'))).toBe(true);
    expect(coversEdge(['Foo'], edge('/l/app/components/Foo.global.vue'))).toBe(true);
    expect(coversEdge(['Foo'], edge('/l/app/composables/Foo.client.ts'))).toBe(false);
  });
});

describe('a bare alias in a suggestion', () => {
  it('proposes the whole layer, never the alias as a name', async () => {
    const edges = [
      makeEdge({
        kind: 'import',
        symbol: 'cartApi',
        fromLayer: 'admin',
        toLayer: 'web',
        to: '/app/web/api.ts',
      }),
    ];
    const findings = [
      makeFinding({
        symbol: 'cartApi',
        fromLayer: 'admin',
        toLayer: 'web',
        target: '/app/web/api.ts',
      }),
    ];
    const [first] = await addSuggestions(
      findings,
      edges,
      layers,
      { layers: { admin: { allow: [] } } },
      '/app',
    );
    expect(first.suggestion?.only).toBeUndefined();
    expect(first.suggestion?.message).toContain('allow "admin" to use "web"');
  });
});

describe('an explicit import in a suggestion', () => {
  it('lists the imported names of an explicit import', async () => {
    const edge = makeEdge({
      kind: 'import',
      symbol: 'cartApi',
      names: ['loadCart'],
      fromLayer: 'admin',
      toLayer: 'web',
      to: '/app/web/api.ts',
    });
    const finding = makeFinding({
      symbol: 'cartApi',
      fromLayer: 'admin',
      toLayer: 'web',
      target: '/app/web/api.ts',
    });
    const [first] = await addSuggestions(
      [finding],
      [edge],
      layers,
      { layers: { admin: { allow: [] } } },
      '/app',
    );
    expect(first.suggestion?.only).toEqual(['loadCart']);
  });
});

describe('a move to a layer that users reach only in part', () => {
  const FILE = '/app/web/useX.ts';
  const use = (fromLayer: string): Edge =>
    makeEdge({
      symbol: 'useX',
      fromLayer,
      toLayer: 'web',
      to: FILE,
      file: `/app/${fromLayer}/a.ts`,
    });
  const finding = (fromLayer: string): Finding =>
    makeFinding({
      symbol: 'useX',
      fromLayer,
      toLayer: 'web',
      target: FILE,
      file: `/app/${fromLayer}/a.ts`,
    });

  async function suggest(only: string[]): Promise<Suggestion | undefined> {
    const config: LayerscopeConfig = {
      layers: {
        admin: { allow: [{ layer: 'shared', only }] },
        shop: { allow: ['shared'] },
      },
    };
    const [first] = await addSuggestions(
      [finding('admin'), finding('shop')],
      [use('admin'), use('shop')],
      layers,
      config,
      '/app',
    );
    return first.suggestion;
  }

  it('does not move the file where the only list does not cover it', async () => {
    const suggestion = await suggest(['other']);
    expect(suggestion?.action).not.toBe('move');
  });

  it('moves the file where the only list covers it', async () => {
    const suggestion = await suggest(['useX']);
    expect(suggestion).toMatchObject({ action: 'move', layer: 'shared' });
  });
});
