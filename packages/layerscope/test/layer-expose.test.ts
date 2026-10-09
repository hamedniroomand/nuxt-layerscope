import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { createBaseline } from '#src/baseline/index.ts';
import { formatResult } from '#src/report/index.ts';
import type { AnalyzeResult, LayerscopeConfig } from '#src/types.ts';
import { findUnused } from '#src/unused/index.ts';
import { findUses } from '#src/why/index.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

/**
 * The nuxt4 fixture: `admin` uses `useCart` (auto-import), `<CartSummary>` (component),
 * `getCartStore` (Nitro server util) and an explicit import of `#layers/web/.../useCart` from
 * `web`.
 */
const ADMIN_ALLOW = ['shared', 'auth', 'ui'];

async function run(layers: LayerscopeConfig['layers']): Promise<AnalyzeResult> {
  const result = await analyze({ rootDir: NUXT4_ROOT, config: { layers } });
  return result;
}

function symbols(result: AnalyzeResult, rule: string): string[] {
  return result.findings
    .filter(finding => finding.rule === rule && finding.fromLayer === 'admin')
    .map(finding => finding.symbol)
    .toSorted();
}

describe('expose on the fixture', () => {
  it('gives no finding for a layer without expose, as before', async () => {
    const result = await run({ admin: { allow: [...ADMIN_ALLOW, 'web'] } });
    expect(result.findings.filter(finding => finding.rule === 'layer-internal')).toEqual([]);
  });

  it('reports the uses of symbols that the layer keeps internal, for each kind of use', async () => {
    const result = await run({
      admin: { allow: [...ADMIN_ALLOW, 'web'] },
      web: { expose: ['useCart', 'CartSummary'] },
    });
    // useCart (auto-import and explicit import) and <CartSummary> are public.
    expect(symbols(result, 'layer-internal')).toEqual(['getCartStore']);
  });

  it('reports an auto-import, a component and an explicit import when nothing is exposed', async () => {
    const result = await run({
      admin: { allow: [...ADMIN_ALLOW, 'web'] },
      web: { expose: [] },
    });
    expect(symbols(result, 'layer-internal')).toEqual([
      '#layers/web/app/composables/useCart',
      'CartSummary',
      'getCartStore',
      'useCart',
    ]);
  });

  it('matches a glob on the path of the file in the layer', async () => {
    const result = await run({
      admin: { allow: [...ADMIN_ALLOW, 'web'] },
      web: { expose: ['app/**'] },
    });
    expect(symbols(result, 'layer-internal')).toEqual(['getCartStore']);
  });
});

describe('layer-internal findings', () => {
  it('is a finding of its own, with the exposed list and a suggestion', async () => {
    const result = await run({
      admin: { allow: [...ADMIN_ALLOW, 'web'] },
      web: { expose: ['useCart', 'CartSummary'] },
    });
    const finding = result.findings.find(candidate => candidate.rule === 'layer-internal');
    expect(finding).toMatchObject({
      severity: 'error',
      toLayer: 'web',
      exposed: ['useCart', 'CartSummary'],
      message: 'Auto-import "getCartStore" is internal to layer "web"',
      suggestion: {
        action: 'expose',
        expose: 'getCartStore',
        message: 'add "getCartStore" to expose of "web" (clears 1 finding)',
      },
    });
    const text = formatResult(result, 'text', NUXT4_ROOT);
    expect(text).toContain('exposed by "web": useCart, CartSummary');
  });

  it('accepts a layer-internal finding in the baseline', async () => {
    const layers = { admin: { allow: [...ADMIN_ALLOW, 'web'] }, web: { expose: ['useCart'] } };
    const result = await run(layers);
    const baseline = createBaseline(result.findings, NUXT4_ROOT);
    expect(baseline.entries.some(entry => entry.rule === 'layer-internal')).toBe(true);
  });
});

describe('scoped allow on the fixture', () => {
  const only = (names: string[]): LayerscopeConfig['layers'] => ({
    admin: { allow: [...ADMIN_ALLOW, { layer: 'web', only: names }] },
  });

  it('allows the listed names for each kind of use and reports the others', async () => {
    const result = await run(only(['useCart', 'CartSummary']));
    expect(symbols(result, 'layer-boundary')).toEqual(['getCartStore']);
    const finding = result.findings.find(candidate => candidate.symbol === 'getCartStore');
    expect(finding?.scoped).toEqual([{ layer: 'web', only: ['useCart', 'CartSummary'] }]);
    expect(finding?.message).toBe(
      'Auto-import "getCartStore" crosses from layer "admin" into "web" (allowed: only useCart, CartSummary)',
    );
  });

  it('proposes a scoped entry when few names cause the findings, and the layer when many do', async () => {
    const few = await run({ admin: { allow: ADMIN_ALLOW } });
    const adminFindings = few.findings.filter(finding => finding.fromLayer === 'admin');
    const suggestion = adminFindings.find(finding => finding.toLayer === 'web')?.suggestion;
    // Four findings from three names and one explicit import: a glob would be needed.
    expect(suggestion?.only).toBeUndefined();
    expect(suggestion?.message).toContain('allow "admin" to use "web"');
    const one = await run({
      admin: { allow: [...ADMIN_ALLOW, { layer: 'web', only: ['useCart', 'CartSummary'] }] },
    });
    const rest = one.findings.find(finding => finding.symbol === 'getCartStore')?.suggestion;
    expect(rest).toMatchObject({
      action: 'allow',
      only: ['useCart', 'CartSummary', 'getCartStore'],
    });
  });

  it('keeps the dependency in the graph and the cycle rule', async () => {
    const result = await run(only(['useCart']));
    expect(result.edges.some(edge => edge.fromLayer === 'admin' && edge.toLayer === 'web')).toBe(
      true,
    );
  });
});

describe('why and unused with expose', () => {
  const layers = {
    admin: { allow: [...ADMIN_ALLOW, 'web'] },
    web: { expose: ['useCart'] },
  };

  it('says whether the layer makes a symbol public', async () => {
    const result = await analyze({ rootDir: NUXT4_ROOT, config: { layers } });
    const [exposed] = findUses(result, 'useCart', { layers });
    const [internal] = findUses(result, 'getCartStore', { layers });
    const [open] = findUses(result, 'formatPrice', { layers });
    expect([exposed.exposure, internal.exposure, open.exposure]).toEqual([
      'exposed',
      'internal',
      'all',
    ]);
    expect(internal.uses[0]?.status).toBe('not-exposed');
  });

  it('marks unused symbols that the layer exposes', async () => {
    const result = await analyze({
      rootDir: NUXT4_ROOT,
      config: { layers: { admin: { expose: ['useAdminStats'] } } },
    });
    const unused = findUnused(result);
    expect(unused.filter(symbol => symbol.exposed).map(symbol => symbol.name)).toEqual([
      'useAdminStats',
    ]);
    expect(unused.some(symbol => !symbol.exposed)).toBe(true);
  });
});
