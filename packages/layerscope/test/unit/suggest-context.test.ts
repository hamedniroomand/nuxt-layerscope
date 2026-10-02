import { describe, expect, it } from 'vite-plus/test';

import { createContext, pairKey } from '#src/suggest/context.ts';
import { makeEdge, makeFinding, makeLayer } from '#test/factories.ts';

describe('suggestion context', () => {
  const shopFile = '/app/layers/shop/composables/useCart.ts';
  const edges = [
    makeEdge(),
    makeEdge({ file: '/app/pages/cart.vue' }),
    makeEdge({ file: shopFile, to: '/app/layers/base/x.ts', toLayer: 'base', fromLayer: 'shop' }),
    makeEdge({ to: null, toLayer: null, external: 'vue' }),
  ];
  const findings = [
    makeFinding(),
    makeFinding({ symbol: 'useTotal' }),
    makeFinding({ fromLayer: 'admin', file: '/app/layers/admin/a.vue' }),
    makeFinding({ rule: 'unresolved-reference', toLayer: null, target: null }),
  ];
  const context = createContext(
    findings,
    edges,
    [makeLayer('web', '/app'), makeLayer('shop', '/app/layers/shop')],
    {},
    '/app',
  );

  it('indexes edges by the file they resolve to and the file they start in', () => {
    expect(context.usesOf.get(shopFile)).toEqual([edges[0], edges[1]]);
    expect(context.edgesFrom.get('/app/pages/index.vue')).toEqual([edges[0], edges[3]]);
    expect(context.edgesFrom.get(shopFile)).toEqual([edges[2]]);
  });

  it('counts findings by target file and by layer pair', () => {
    expect(context.findingsAt.get(shopFile)).toBe(3);
    expect(context.findingsFor.get(pairKey('web', 'shop'))).toBe(2);
    expect(context.findingsFor.get(pairKey('admin', 'shop'))).toBe(1);
    // A finding without a target layer counts for no pair.
    expect(context.findingsFor.get(pairKey('web', ''))).toBeUndefined();
  });

  it('records the cross-layer dependencies seen in the code', () => {
    expect([...(context.seen.get('web') ?? [])]).toEqual(['shop']);
    expect([...(context.seen.get('shop') ?? [])]).toEqual(['base']);
  });
});
