import { describe, expect, it } from 'vite-plus/test';

import { edgeStatus } from '#src/rules/edge-status.ts';
import { boundaryFindings, isAllowed } from '#src/rules/layer-boundary.ts';
import { internalFindings } from '#src/rules/layer-internal.ts';
import type { LayerscopeConfig } from '#src/types.ts';
import { makeEdge, makeLayer } from '#test/factories.ts';

const layers = [makeLayer('admin', '/app/layers/admin'), makeLayer('web', '/app/layers/web')];
const FILE = '/app/layers/web/app/composables/useCart.ts';
const INTERNAL = '/app/layers/web/app/composables/useCartStorage.ts';
const use = makeEdge({ fromLayer: 'admin', toLayer: 'web', to: FILE, symbol: 'useCart' });
const hidden = makeEdge({
  fromLayer: 'admin',
  toLayer: 'web',
  to: INTERNAL,
  symbol: 'useCartStorage',
});

function configOf(allow: LayerscopeConfig['layers'] extends infer L ? L : never): LayerscopeConfig {
  return { layers: allow };
}

describe('scoped allow', () => {
  it('allows the names of the entry and no other symbol of the layer', () => {
    const config = configOf({ admin: { allow: ['shared', { layer: 'web', only: ['useCart'] }] } });
    expect(boundaryFindings([use], config, layers)).toEqual([]);
    const [finding] = boundaryFindings([hidden], config, layers);
    expect(finding).toMatchObject({
      rule: 'layer-boundary',
      allowed: ['shared'],
      scoped: [{ layer: 'web', only: ['useCart'] }],
      message:
        'Auto-import "useCartStorage" crosses from layer "admin" into "web" (allowed: only useCart)',
    });
  });

  it('allows a symbol that a glob of the entry matches', () => {
    const allow = [{ layer: 'web', only: ['app/composables/useCart.*'] }];
    expect(isAllowed(use, allow, layers)).toBe(true);
    expect(isAllowed(hidden, allow, layers)).toBe(false);
  });

  it('does not count for another layer', () => {
    const allow = [{ layer: 'shared', only: ['useCart'] }];
    expect(isAllowed(use, allow, layers)).toBe(false);
  });
});

describe('internalFindings', () => {
  const exposing = (allow: string[] | null = null): LayerscopeConfig =>
    configOf({ admin: allow === null ? {} : { allow }, web: { expose: ['useCart'] } });

  it('reports a use of a symbol that the layer does not expose', () => {
    expect(internalFindings([use], exposing(), layers)).toEqual([]);
    const [finding] = internalFindings([hidden], exposing(), layers);
    expect(finding).toMatchObject({
      rule: 'layer-internal',
      severity: 'error',
      symbol: 'useCartStorage',
      fromLayer: 'admin',
      toLayer: 'web',
      exposed: ['useCart'],
      message: 'Auto-import "useCartStorage" is internal to layer "web"',
    });
  });
});

describe('internalFindings for other layers and severities', () => {
  const exposing = (allow: string[] | null = null): LayerscopeConfig =>
    configOf({ admin: allow === null ? {} : { allow }, web: { expose: ['useCart'] } });

  it('treats a layer without expose as fully public', () => {
    const config = configOf({ admin: {}, web: {} });
    expect(internalFindings([use, hidden], config, layers)).toEqual([]);
  });

  it('treats an empty expose list as nothing public', () => {
    const config = configOf({ web: { expose: [] } });
    expect(internalFindings([use], config, layers)).toHaveLength(1);
  });

  it('never reports a use inside the layer or of a package', () => {
    const same = makeEdge({ fromLayer: 'web', toLayer: 'web', to: INTERNAL });
    const external = makeEdge({ toLayer: null, to: null, external: 'vue' });
    expect(internalFindings([same, external], exposing(), layers)).toEqual([]);
  });

  it('reports only layer-boundary for a layer that allow does not reach', () => {
    const config = exposing(['shared']);
    expect(boundaryFindings([hidden], config, layers)).toHaveLength(1);
    expect(internalFindings([hidden], config, layers)).toEqual([]);
  });

  it('asks both checks: scoped allow, then expose', () => {
    const config = configOf({
      admin: { allow: [{ layer: 'web', only: ['useCart', 'useCartStorage'] }] },
      web: { expose: ['useCart'] },
    });
    // The scoped entry lets `useCartStorage` through, expose still keeps it internal.
    expect(boundaryFindings([use, hidden], config, layers)).toEqual([]);
    expect(internalFindings([use, hidden], config, layers).map(finding => finding.symbol)).toEqual([
      'useCartStorage',
    ]);
  });

  it('follows the rule severity', () => {
    const config: LayerscopeConfig = { ...exposing(), rules: { 'layer-internal': 'warn' } };
    expect(internalFindings([hidden], config, layers)[0]?.severity).toBe('warn');
    expect(
      internalFindings([hidden], { ...config, rules: { 'layer-internal': 'off' } }, layers),
    ).toEqual([]);
  });
});

describe('edgeStatus with expose and scoped allow', () => {
  it('has a status for a symbol that is not exposed, and for a scoped one that is allowed', () => {
    const config = configOf({
      admin: { allow: [{ layer: 'web', only: ['useCart', 'useCartStorage'] }] },
      web: { expose: ['useCart'] },
    });
    expect(edgeStatus(use, config, layers)).toBe('allowed');
    expect(edgeStatus(hidden, config, layers)).toBe('not-exposed');
    expect(edgeStatus(hidden, configOf({ admin: { allow: [] } }), layers)).toBe('not-allowed');
    expect(edgeStatus(hidden, configOf({ web: { expose: ['x'] } }), layers)).toBe('not-exposed');
  });
});
