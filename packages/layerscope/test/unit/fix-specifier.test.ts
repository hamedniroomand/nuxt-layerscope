import { describe, expect, it } from 'vite-plus/test';

import { newSpecifier } from '#src/fix/specifier.ts';
import { makeEdge } from '#test/factories.ts';

describe('newSpecifier', () => {
  it('returns null for aliases and package imports', () => {
    expect(
      newSpecifier(
        makeEdge({ symbol: '~/composables/useCart', to: '/app/x.ts' }),
        '/a.ts',
        '/b.ts',
      ),
    ).toBeNull();
    expect(newSpecifier(makeEdge({ symbol: '#imports', to: null }), '/a.ts', '/b.ts')).toBeNull();
  });

  it('rewrites a relative specifier to the new locations', () => {
    const edge = makeEdge({
      symbol: '../composables/useCart',
      to: '/app/layers/shop/composables/useCart.ts',
    });
    expect(
      newSpecifier(edge, '/app/pages/index.vue', '/app/layers/web/composables/useCart.ts'),
    ).toBe('../layers/web/composables/useCart');
  });

  it('keeps the extension when the original specifier had one', () => {
    const edge = makeEdge({
      symbol: './useCart.ts',
      to: '/app/composables/useCart.ts',
    });
    expect(newSpecifier(edge, '/app/composables/index.ts', '/app/utils/useCart.ts')).toBe(
      '../utils/useCart.ts',
    );
  });

  it('drops a trailing index when the original did', () => {
    const edge = makeEdge({
      symbol: '../utils',
      to: '/app/utils/index.ts',
    });
    expect(newSpecifier(edge, '/app/pages/a.ts', '/app/lib/index.ts')).toBe('../lib');
  });

  it('prefixes ./ when the relative path would otherwise be bare', () => {
    const edge = makeEdge({
      symbol: './sibling',
      to: '/app/a/sibling.ts',
    });
    expect(newSpecifier(edge, '/app/a/file.ts', '/app/a/other.ts')).toBe('./other');
  });
});
