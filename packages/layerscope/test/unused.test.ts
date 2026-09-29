import { relative } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { findUnused } from '#src/unused/index.ts';
import { NUXT3_ROOT, NUXT4_ROOT } from '#test/fixtures.ts';

describe('findUnused', () => {
  it('lists symbols nothing references, per layer', async () => {
    const result = await analyze({ rootDir: NUXT4_ROOT });
    const rows = findUnused(result).map(symbol => [
      symbol.layer,
      symbol.name,
      symbol.kind,
      symbol.context,
      relative(NUXT4_ROOT, symbol.file),
      symbol.possiblyUsed,
    ]);
    expect(rows).toEqual([
      ['web', 'CartBadge', 'component', null, 'layers/web/app/components/CartBadge.vue', true],
      [
        'admin',
        'useAdminStats',
        'auto-import',
        'app',
        'layers/admin/app/composables/useAdminStats.ts',
        false,
      ],
      [
        'admin',
        'useAdminTheme',
        'auto-import',
        'app',
        'layers/admin/app/composables/useAdminTheme.ts',
        false,
      ],
      ['admin', 'exportCsv', 'auto-import', 'app', 'layers/admin/app/utils/exportCsv.ts', false],
    ]);
  });

  it('counts explicit imports, #imports and #components as uses', async () => {
    const result = await analyze({ rootDir: NUXT3_ROOT });
    expect(findUnused(result)).toEqual([]);
  });

  it('marks components as possibly used when the project renders dynamic components', async () => {
    const result = await analyze({ rootDir: NUXT4_ROOT });
    expect(result.dynamicComponentFiles.map(file => relative(NUXT4_ROOT, file))).toEqual([
      'layers/web/app/components/CartSummary.vue',
    ]);
  });
});
