import { join, relative } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { formatResult } from '#src/report/index.ts';
import { LAYER_UI_ROOT, NUXT4_ROOT } from '#test/fixtures.ts';

const result = await analyze({ rootDir: NUXT4_ROOT });

function summary(): string[] {
  return result.findings.map(
    f => `${f.rule} ${relative(NUXT4_ROOT, f.file)}:${f.line}:${f.column} ${f.symbol}`,
  );
}

describe('nuxt 4 fixture with auto-registered layers', () => {
  it('names layers after their directories', () => {
    expect(result.layers.map(layer => layer.name)).toEqual([
      'root',
      'web',
      'shared',
      'auth',
      'admin',
      'ui',
    ]);
  });

  it('reports every boundary crossing and unresolved reference', () => {
    expect(summary()).toEqual([
      'layer-boundary layers/admin/app/components/AdminPanel.vue:2:14 useCart',
      'layer-boundary layers/admin/app/components/AdminPanel.vue:8:5 CartSummary',
      'layer-boundary layers/admin/app/composables/useAdminTheme.ts:3:10 useTheme',
      'layer-boundary layers/admin/app/utils/exportCsv.ts:1:25 #layers/web/app/composables/useCart',
      'layer-boundary layers/admin/server/api/stats.get.ts:3:10 getCartStore',
      'unresolved-reference layers/web/app/components/CartSummary.vue:10:5 <component :is>',
      'unresolved-reference layers/web/app/composables/useCart.ts:2:3 trackEvent',
    ]);
  });
});

describe('unresolved references', () => {
  it('point runtime registrations at the globals option', () => {
    const finding = result.findings.find(f => f.symbol === 'trackEvent');
    expect(finding?.message).toContain('add it to "globals" in layerscope.config.ts');
  });
});

describe('nuxt 4 fixture with a layer from a workspace package', () => {
  const ui = result.layers.find(layer => layer.name === 'ui');

  it('takes the layer name from $meta and its dirs from Nuxt', () => {
    expect(ui).toMatchObject({
      root: LAYER_UI_ROOT,
      srcDir: join(LAYER_UI_ROOT, 'src'),
      serverDir: join(LAYER_UI_ROOT, 'nitro'),
    });
  });

  it('scans the custom srcDir', () => {
    expect(result.files).toContain(join(LAYER_UI_ROOT, 'src/components/UiBadge.vue'));
  });

  it('reports the auto-import with its target', () => {
    const finding = result.findings.find(f => f.symbol === 'useTheme');
    expect(finding).toMatchObject({
      fromLayer: 'admin',
      toLayer: 'ui',
      target: join(LAYER_UI_ROOT, 'src/composables/useTheme.ts'),
      allowed: ['shared', 'auth'],
    });
  });

  it('resolves server utils from the custom serverDir', () => {
    const edge = result.edges.find(e => e.symbol === 'themeHeader');
    expect(edge).toMatchObject({ fromLayer: 'web', toLayer: 'ui' });
  });
});

describe('nuxt 4 fixture edges', () => {
  it('lets a local binding shadow an auto-import', () => {
    const stats = result.edges.filter(edge => edge.file.endsWith('useAdminStats.ts'));
    expect(stats.map(edge => [edge.symbol, edge.toLayer])).toEqual([['formatPrice', 'shared']]);
  });

  it('resolves identifiers used only in templates', () => {
    const edge = result.edges.find(
      e => e.file.endsWith('AdminPanel.vue') && e.symbol === 'formatPrice',
    );
    expect(edge).toMatchObject({ kind: 'auto-import', toLayer: 'shared', line: 9 });
  });

  it('uses the Nitro symbol table for server files', () => {
    const edge = result.edges.find(e => e.file.endsWith('stats.get.ts') && e.symbol === 'useDb');
    expect(edge?.toLayer).toBe('shared');
    expect(edge?.to).toBe(join(NUXT4_ROOT, 'layers/shared/server/utils/db.ts'));
  });

  it('classifies framework auto-imports as external', () => {
    const edge = result.edges.find(e => e.symbol === 'defineEventHandler');
    expect(edge).toMatchObject({ toLayer: null, to: null, external: 'h3' });
  });

  it('matches kebab-case component tags', () => {
    const edge = result.edges.find(
      e => e.file.endsWith('CartSummary.vue') && e.kind === 'component',
    );
    expect(edge).toMatchObject({ symbol: 'BaseButton', toLayer: 'shared' });
  });

  it('produces byte-identical output across runs', async () => {
    const again = await analyze({ rootDir: NUXT4_ROOT });
    expect(formatResult(again, 'json', NUXT4_ROOT)).toBe(formatResult(result, 'json', NUXT4_ROOT));
  });
});
