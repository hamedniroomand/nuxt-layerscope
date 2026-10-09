import { describe, expect, it } from 'vite-plus/test';

import { findingDetails } from '#src/report/details.ts';
import { formatWhy } from '#src/report/why.ts';
import type { SymbolTarget } from '#src/why/index.ts';
import { makeEdge, makeFinding } from '#test/factories.ts';

describe('findingDetails with scoped and exposed lists', () => {
  it('shows a scoped entry next to the layers allowed whole', () => {
    const finding = makeFinding({
      allowed: ['shared'],
      scoped: [{ layer: 'shop', only: ['useCart', 'CartSummary'] }],
    });
    expect(findingDetails(finding, '/app')).toContain(
      'allowed for "web": shared, shop (only useCart, CartSummary)',
    );
  });

  it('shows what a layer exposes', () => {
    expect(
      findingDetails(makeFinding({ rule: 'layer-internal', exposed: ['useCart'] }), '/app'),
    ).toContain('exposed by "shop": useCart');
    expect(findingDetails(makeFinding({ rule: 'layer-internal', exposed: [] }), '/app')).toContain(
      'exposed by "shop": nothing',
    );
  });
});

describe('formatWhy with exposure', () => {
  const target = (exposure: SymbolTarget['exposure']): SymbolTarget => ({
    symbol: 'useCart',
    file: '/app/layers/shop/composables/useCart.ts',
    layer: 'shop',
    external: null,
    exposure,
    uses: [{ edge: makeEdge(), status: 'not-exposed' }],
  });

  it('tells whether the layer makes the symbol public', () => {
    expect(formatWhy('useCart', [target('internal')], 'text', '/app')).toContain(
      'useCart → layers/shop/composables/useCart.ts (shop, internal)',
    );
    expect(formatWhy('useCart', [target('exposed')], 'text', '/app')).toContain('(shop, exposed)');
    expect(formatWhy('useCart', [target('all')], 'text', '/app')).toContain('(shop)');
    expect(formatWhy('useCart', [target('internal')], 'text', '/app')).toContain('✖ not exposed');
  });

  it('adds the exposure to the JSON report', () => {
    const json = JSON.parse(formatWhy('useCart', [target('exposed')], 'json', '/app')) as {
      targets: { exposure: string }[];
    };
    expect(json.targets[0]?.exposure).toBe('exposed');
  });
});
