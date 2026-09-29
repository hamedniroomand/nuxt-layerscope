import { relative } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { NUXT3_ROOT } from '#test/fixtures.ts';

const result = await analyze({ rootDir: NUXT3_ROOT });

describe('nuxt 3 fixture with extends layers', () => {
  it('resolves extended layers by directory name', () => {
    expect(result.layers.map(layer => layer.name)).toEqual([
      'root',
      'base',
      'checkout',
      'backoffice',
    ]);
  });

  it('reports explicit and auto-imported crossings alike', () => {
    expect(
      result.findings.map(f => `${relative(NUXT3_ROOT, f.file)}:${f.line} ${f.symbol}`),
    ).toEqual([
      'backoffice/components/OrdersTable.vue:2 ../../checkout/composables/useBasket',
      'backoffice/components/OrdersTable.vue:6 LazyBasketList',
    ]);
  });

  it('scans the root layer without re-scanning nested layers', () => {
    const rootFiles = result.files.filter(file => relative(NUXT3_ROOT, file).startsWith('pages/'));
    expect(rootFiles).toHaveLength(1);
    expect(new Set(result.files).size).toBe(result.files.length);
  });

  it('takes layers and rules from the layerscope key of nuxt.config', () => {
    expect(result.config.layers?.checkout).toEqual({ allow: ['base'] });
  });

  it('sees server utils from a lower layer', () => {
    const edge = result.edges.find(
      e => e.file.endsWith('orders.get.ts') && e.symbol === 'logEvent',
    );
    expect(edge).toMatchObject({ fromLayer: 'backoffice', toLayer: 'base' });
  });
});
