import { describe, expect, it } from 'vite-plus/test';

import { edgeStatus } from '#src/rules/edge-status.ts';
import { boundaryFindings, isAllowed } from '#src/rules/layer-boundary.ts';
import type { LayerscopeConfig } from '#src/types.ts';
import { makeEdge } from '#test/factories.ts';

const config: LayerscopeConfig = {
  layers: { web: { allow: ['shared'] }, shop: {} },
};

describe('isAllowed', () => {
  it('always allows packages and the own layer', () => {
    expect(isAllowed(makeEdge({ toLayer: null }), [])).toBe(true);
    expect(isAllowed(makeEdge({ toLayer: 'web' }), [])).toBe(true);
  });

  it('allows only listed layers otherwise', () => {
    expect(isAllowed(makeEdge({ toLayer: 'shared' }), ['shared'])).toBe(true);
    expect(isAllowed(makeEdge({ toLayer: 'shop' }), ['shared'])).toBe(false);
  });
});

describe('boundaryFindings', () => {
  it('reports an edge into a layer that is not allowed', () => {
    const [finding, ...rest] = boundaryFindings([makeEdge()], config);
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({
      rule: 'layer-boundary',
      severity: 'error',
      symbol: 'useCart',
      fromLayer: 'web',
      toLayer: 'shop',
      allowed: ['shared'],
      message: 'Auto-import "useCart" crosses from layer "web" into "shop"',
    });
  });

  it('words the message by edge kind', () => {
    const [component] = boundaryFindings(
      [makeEdge({ kind: 'component', symbol: 'ShopPanel' })],
      config,
    );
    const [imported] = boundaryFindings(
      [makeEdge({ kind: 'import', symbol: '~~/layers/shop/x' })],
      config,
    );
    expect(component.message).toContain('Component <ShopPanel>');
    expect(imported.message).toContain('Import "~~/layers/shop/x"');
  });

  it('skips allowed edges, packages and layers without an allow list', () => {
    const edges = [
      makeEdge({ toLayer: 'shared' }),
      makeEdge({ toLayer: null, to: null, external: 'vue' }),
      makeEdge({ fromLayer: 'shop', toLayer: 'web' }),
    ];
    expect(boundaryFindings(edges, config)).toEqual([]);
  });

  it('uses the configured severity and reports nothing when off', () => {
    const warn = boundaryFindings([makeEdge()], { ...config, rules: { 'layer-boundary': 'warn' } });
    expect(warn[0].severity).toBe('warn');
    expect(
      boundaryFindings([makeEdge()], { ...config, rules: { 'layer-boundary': 'off' } }),
    ).toEqual([]);
  });
});

describe('edgeStatus', () => {
  it.each([
    ['external', makeEdge({ toLayer: null, to: null, external: 'vue' }), 'external'],
    ['same layer', makeEdge({ toLayer: 'web' }), 'same-layer'],
    ['unrestricted', makeEdge({ fromLayer: 'shop', toLayer: 'web' }), 'unrestricted'],
    ['allowed', makeEdge({ toLayer: 'shared' }), 'allowed'],
    ['not allowed', makeEdge({ toLayer: 'shop' }), 'not-allowed'],
  ])('classifies %s', (_name, edge, status) => {
    expect(edgeStatus(edge, config)).toBe(status);
  });
});
