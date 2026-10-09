import { describe, expect, it } from 'vite-plus/test';

import { coversEdge } from '#src/rules/exposure.ts';
import { makeEdge } from '#test/factories.ts';

const ROOT = '/app/layers/shop';
const FILE = '/app/layers/shop/app/composables/useCart.ts';

describe('coversEdge by name', () => {
  it('matches an auto-import by its name', () => {
    expect(coversEdge(['useCart'], makeEdge({ to: FILE }), ROOT)).toBe(true);
    expect(coversEdge(['useOther'], makeEdge({ to: FILE }), ROOT)).toBe(false);
  });

  it.each(['CartSummary', 'LazyCartSummary', 'cart-summary', 'lazy-cart-summary'])(
    'matches the component <%s> by one name for all spellings',
    symbol => {
      const edge = makeEdge({ kind: 'component', symbol, to: '/x/CartSummary.vue' });
      expect(coversEdge(['CartSummary'], edge, ROOT)).toBe(true);
      expect(coversEdge(['cart-summary'], edge, ROOT)).toBe(true);
      expect(coversEdge(['Other'], edge, ROOT)).toBe(false);
    },
  );

  it('matches #imports and #components by the name after the colon', () => {
    const imports = makeEdge({ kind: 'import', symbol: '#imports:useCart', to: FILE });
    const components = makeEdge({ kind: 'import', symbol: '#components:LazyCartSummary' });
    expect(coversEdge(['useCart'], imports, ROOT)).toBe(true);
    expect(coversEdge(['CartSummary'], components, ROOT)).toBe(true);
    expect(coversEdge(['useOther'], imports, ROOT)).toBe(false);
  });

  it('matches an explicit import by the names it imports', () => {
    const edge = makeEdge({
      kind: 'import',
      symbol: '~/cart',
      names: ['useCart', 'useStore'],
      to: FILE,
    });
    expect(coversEdge(['useCart'], edge, ROOT)).toBe(false);
    expect(coversEdge(['useCart', 'useStore'], edge, ROOT)).toBe(true);
  });

  it('matches a default or namespace import by the base name of the file', () => {
    const edge = makeEdge({ kind: 'import', symbol: '~/cart', names: ['default'], to: FILE });
    expect(coversEdge(['useCart'], edge, ROOT)).toBe(true);
    expect(coversEdge(['other'], edge, ROOT)).toBe(false);
    const star = makeEdge({ kind: 'import', symbol: '~/cart', names: ['*'], to: FILE });
    expect(coversEdge(['useCart'], star, ROOT)).toBe(true);
    const unknown = makeEdge({ kind: 'import', symbol: '~/cart', to: FILE });
    expect(coversEdge(['useCart'], unknown, ROOT)).toBe(true);
  });
});

describe('coversEdge by glob', () => {
  it('matches the path of the target file relative to the layer root', () => {
    const edge = makeEdge({ to: FILE });
    expect(coversEdge(['app/composables/**'], edge, ROOT)).toBe(true);
    expect(coversEdge(['app/utils/**'], edge, ROOT)).toBe(false);
  });

  it('covers every kind of use of a file that a glob matches', () => {
    const imported = makeEdge({ kind: 'import', symbol: '~/cart', names: ['x'], to: FILE });
    expect(coversEdge(['app/composables/*.ts'], imported, ROOT)).toBe(true);
  });

  it('finds no path without a layer root or a target', () => {
    expect(coversEdge(['app/**'], makeEdge({ to: FILE }))).toBe(false);
    expect(coversEdge(['app/**'], makeEdge({ to: null }), ROOT)).toBe(false);
  });
});
