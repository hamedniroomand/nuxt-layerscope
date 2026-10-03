import type { ReportResponse, TabFinding, TabReport } from '#src/devtools/protocol.ts';
import { makeFinding } from '#test/factories.ts';

export function tabFinding(overrides: Partial<TabFinding> = {}): TabFinding {
  const finding = makeFinding();
  return {
    ...finding,
    file: 'pages/index.vue',
    target: 'layers/shop/composables/useCart.ts',
    absFile: finding.file,
    absTarget: finding.target,
    key: `layer-boundary\0pages/index.vue\0${finding.symbol}\0shop`,
    isNew: false,
    ...overrides,
  };
}

export function tabReport(overrides: Partial<TabReport> = {}): TabReport {
  return {
    version: 1,
    source: 'registry',
    notes: [],
    absRoot: '/app',
    layers: [
      { name: 'web', root: '.' },
      { name: 'shop', root: 'layers/shop' },
    ],
    summary: { files: 2, errors: 0, warnings: 0 },
    findings: [],
    hotFiles: [],
    layerStats: [
      { name: 'web', root: '.', allow: ['base'], files: 1, refsIn: 0, refsOut: 1 },
      { name: 'shop', root: 'layers/shop', allow: null, files: 1, refsIn: 1, refsOut: 0 },
    ],
    newCount: 0,
    ...overrides,
  };
}

export function reportResponse(overrides: Partial<TabReport> = {}, rev = 0): ReportResponse {
  return { id: 'a', rev, marker: 0, analyzedAt: 0, durationMs: 12, report: tabReport(overrides) };
}

/** Two boundary errors in two files and one warning, in report order. */
export function sampleFindings(): TabFinding[] {
  return [
    tabFinding({ symbol: 'useCart', message: 'useCart is not allowed' }),
    tabFinding({
      file: 'layers/admin/pages/orders.vue',
      fromLayer: 'admin',
      symbol: 'CartBadge',
      message: 'CartBadge is not allowed',
    }),
    tabFinding({
      rule: 'shadowed-component',
      severity: 'warn',
      file: 'layers/ui/Button.vue',
      symbol: 'Button',
      toLayer: null,
      message: 'Button is shadowed',
    }),
  ];
}
