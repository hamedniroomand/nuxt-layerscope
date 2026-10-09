import { describe, expect, it } from 'vite-plus/test';

import { allowHint } from '#src/devtools/hints.ts';
import { addSuggestions } from '#src/suggest/index.ts';
import { MAX_ONLY, nameOfFinding, onlyNames } from '#src/suggest/scoped.ts';
import type { Finding, LayerscopeConfig } from '#src/types.ts';
import { makeEdge, makeFinding, makeLayer, makeResult } from '#test/factories.ts';

const named = (...symbols: string[]): Finding[] =>
  symbols.map(symbol => makeFinding({ symbol, fromLayer: 'admin', toLayer: 'web' }));

describe('onlyNames', () => {
  it('lists the names when few of them cause the findings', () => {
    expect(onlyNames(named('b', 'a'))).toEqual(['a', 'b']);
    expect(onlyNames(named('a', 'a'))).toEqual(['a']);
    expect(MAX_ONLY).toBe(3);
    expect(onlyNames(named('a', 'b', 'c'))).toEqual(['a', 'b', 'c']);
  });

  it('keeps the whole layer above the limit', () => {
    expect(onlyNames(named('a', 'b', 'c', 'd'))).toBeNull();
  });

  it('keeps the whole layer when an explicit import would need a glob', () => {
    expect(onlyNames(named('a', '~/cart/useCart'))).toBeNull();
    expect(onlyNames(named('#layers/web/app/composables/useCart'))).toBeNull();
    expect(nameOfFinding(makeFinding({ symbol: '#imports:useCart' }))).toBe('useCart');
  });
});

describe('scoped suggestions', () => {
  const layers = [makeLayer('admin', '/app/admin'), makeLayer('web', '/app/web')];
  const config: LayerscopeConfig = { layers: { admin: { allow: [] } } };

  async function suggestionOf(symbols: string[]): Promise<Finding | undefined> {
    const findings = named(...symbols);
    const edges = symbols.map(symbol =>
      makeEdge({ symbol, fromLayer: 'admin', toLayer: 'web', to: `/app/web/${symbol}.ts` }),
    );
    const [first] = await addSuggestions(findings, edges, layers, config, '/app');
    return first;
  }

  it('proposes a scoped entry for up to three names', async () => {
    const finding = await suggestionOf(['useCart', 'useCartTotal']);
    expect(finding?.suggestion).toMatchObject({
      action: 'allow',
      only: ['useCart', 'useCartTotal'],
      message:
        'allow "admin" to use "useCart", "useCartTotal" from "web" (adds 1 edge, clears 2 findings)',
      impact: { fixes: 2, edges: 1 },
    });
  });

  it('proposes the whole layer for more names', async () => {
    const finding = await suggestionOf(['a', 'b', 'c', 'd']);
    expect(finding?.suggestion?.only).toBeUndefined();
    expect(finding?.suggestion?.message).toContain('allow "admin" to use "web"');
  });

  it('gives the hint a scoped snippet', async () => {
    const finding = await suggestionOf(['useCart']);
    const result = makeResult({ config, findings: finding === undefined ? [] : [finding] });
    const hint = allowHint(finding ?? makeFinding(), result);
    expect(hint?.only).toEqual(['useCart']);
    expect(hint?.snippet).toBe(
      "layers: {\n  admin: { allow: [{ layer: 'web', only: ['useCart'] }] },\n}",
    );
  });
});
