import { describe, expect, it, vi } from 'vite-plus/test';

import { suggestSymbols } from '#src/devtools/client/lib/autocomplete.ts';
import { copyText } from '#src/devtools/client/lib/clipboard.ts';
import { emptyQuery, formatHash, parseHash } from '#src/devtools/client/lib/router.ts';
import { traceGroups, unusedGroups, useCount } from '#src/devtools/client/lib/view-groups.ts';
import type { SymbolEntry, TraceView } from '#src/devtools/protocol.ts';

describe('trace route', () => {
  it('keeps the symbol in the path', () => {
    const route = { view: 'trace' as const, query: emptyQuery(), param: 'Base Button/x' };
    expect(formatHash(route)).toBe('#/trace/Base%20Button%2Fx');
    expect(parseHash('#/trace/Base%20Button%2Fx')).toEqual(route);
    expect(parseHash('#/trace/%E0%A4%A')).toEqual({ view: 'trace', query: emptyQuery() });
    expect(parseHash('#/trace')).toEqual({ view: 'trace', query: emptyQuery() });
  });
});

describe('symbol suggestions', () => {
  const entry = (name: string): SymbolEntry => ({
    name,
    kind: 'auto-import',
    layer: 'web',
    contexts: ['app'],
  });

  it('ranks exact names, then prefixes, then the rest, at most 12', () => {
    const symbols = ['useCartTotal', 'getCart', 'useCart', 'useCartItems', 'cart'].map(name =>
      entry(name),
    );
    expect(suggestSymbols(symbols, 'usecart').map(symbol => symbol.name)).toEqual([
      'useCart',
      'useCartTotal',
      'useCartItems',
    ]);
    expect(suggestSymbols(symbols, 'cart').map(symbol => symbol.name)).toEqual([
      'cart',
      'getCart',
      'useCart',
      'useCartTotal',
      'useCartItems',
    ]);
    expect(suggestSymbols(symbols, '  ')).toEqual([]);
    const many = Array.from({ length: 20 }, (_, index) => entry(`use${index}`));
    expect(suggestSymbols(many, 'use')).toHaveLength(12);
  });
});

describe('view groups', () => {
  const use = (fromLayer: string, status: 'not-allowed' | 'same-layer' | 'allowed'): object => ({
    file: `${fromLayer}.vue`,
    line: 1,
    column: 1,
    kind: 'auto-import',
    symbol: 'useCart',
    fromLayer,
    toLayer: 'web',
    status,
  });

  it('groups trace uses by layer with not-allowed groups first', () => {
    const view = {
      version: 1,
      symbol: 'useCart',
      targets: [
        {
          symbol: 'useCart',
          file: 'web/useCart.ts',
          layer: 'web',
          external: null,
          uses: [use('web', 'same-layer'), use('admin', 'allowed'), use('admin', 'not-allowed')],
        },
      ],
    } as TraceView;
    const groups = traceGroups(view);
    expect(groups.map(group => [group.layer, group.status, group.uses.length])).toEqual([
      ['admin', 'not-allowed', 2],
      ['web', 'same-layer', 1],
    ]);
    expect(groups[0]?.uses[0]?.target.file).toBe('web/useCart.ts');
    expect(useCount(view)).toBe(3);
  });
});

describe('unused groups', () => {
  it('groups unused symbols in layer order', () => {
    const row = (name: string, layer: string): object => ({
      name,
      layer,
      kind: 'component',
      context: null,
      file: `${name}.vue`,
      possiblyUsed: false,
    });
    const groups = unusedGroups({
      unused: [row('A', 'ui'), row('B', 'base'), row('C', 'ui')],
      possiblyUsed: false,
      layers: ['base', 'ui'],
    } as Parameters<typeof unusedGroups>[0]);
    expect(groups.map(group => [group.layer, group.rows.length])).toEqual([
      ['base', 1],
      ['ui', 2],
    ]);
  });
});

describe('clipboard', () => {
  it('reports whether the browser copied the text', async () => {
    const writeText = vi.fn<Clipboard['writeText']>().mockResolvedValue();
    expect(await copyText('x', { writeText })).toBe(true);
    writeText.mockRejectedValue(new Error('denied'));
    expect(await copyText('x', { writeText })).toBe(false);
    expect(await copyText('x')).toBe(false);
  });
});
