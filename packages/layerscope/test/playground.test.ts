import { describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { findUnused } from '#src/unused/index.ts';
import { PLAYGROUND_ROOT } from '#test/fixtures.ts';

/** [rule, severity, file, symbol] of each finding the playground has on purpose (see its README). */
const INTENTIONAL = [
  ['unresolved-reference', 'warn', 'app/pages/admin.vue', '<component :is>'],
  ['unresolved-reference', 'warn', 'layers/admin/app/utils/exportCsv.ts', 'analytics'],
  ['shadowed-component', 'warn', 'layers/base/app/components/AppButton.vue', 'AppButton'],
  ['layer-boundary', 'error', 'layers/base/app/composables/useTheme.ts', 'useToast'],
  ['layer-boundary', 'error', 'layers/shop/app/composables/useCart.ts', 'useOrders'],
  ['layer-boundary', 'error', 'layers/ui/app/components/AppCard.vue', 'useCart'],
];

/**
 * Pins rule, file and symbol, not positions: an edit to the playground that adds or removes a
 * finding shows here, and the README table must change with it.
 */
describe('playground findings', () => {
  it('reports exactly the intentional findings', async () => {
    const result = await analyze({ rootDir: PLAYGROUND_ROOT });
    const found = result.findings
      .map(({ rule, severity, file, symbol }) => [
        rule,
        severity,
        file.slice(PLAYGROUND_ROOT.length + 1),
        symbol,
      ])
      .toSorted((a, b) => `${a[2]}${a[3]}`.localeCompare(`${b[2]}${b[3]}`));
    expect(found).toEqual(INTENTIONAL);
  }, 60_000);

  it('leaves one component and one auto-import unused', async () => {
    const result = await analyze({ rootDir: PLAYGROUND_ROOT });
    expect(
      findUnused(result)
        .map(({ name, kind, layer }) => ({ name, kind, layer }))
        .toSorted((a, b) => a.name.localeCompare(b.name)),
    ).toEqual([
      { name: 'AppBadge', kind: 'component', layer: 'ui' },
      { name: 'formatDate', kind: 'auto-import', layer: 'base' },
    ]);
  }, 60_000);
});
