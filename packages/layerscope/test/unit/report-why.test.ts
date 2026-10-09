import { describe, expect, it } from 'vite-plus/test';

import { formatWhy, isWhyFormat, STATUS_LABELS, toWhyReport } from '#src/report/why.ts';
import type { SymbolTarget } from '#src/why/index.ts';
import { makeEdge } from '#test/factories.ts';

const CWD = '/app';

const targets: SymbolTarget[] = [
  {
    symbol: 'useCart',
    file: '/app/layers/shop/composables/useCart.ts',
    layer: 'shop',
    external: null,
    exposure: 'all',
    uses: [
      { edge: makeEdge(), status: 'not-allowed' },
      { edge: makeEdge({ file: '/app/pages/cart.vue', line: 12 }), status: 'allowed' },
    ],
  },
  {
    symbol: 'ref',
    file: null,
    layer: null,
    external: 'vue',
    exposure: 'all',
    uses: [{ edge: makeEdge({ toLayer: null, to: null, external: 'vue' }), status: 'external' }],
  },
];

describe('formatWhy', () => {
  it('describes each target and aligns its uses', () => {
    const output = formatWhy('useCart', targets, 'text', CWD);
    expect(output).toContain('useCart → layers/shop/composables/useCart.ts (shop)');
    expect(output).toContain('pages/index.vue:3:5   web → shop   ✖ not allowed');
    expect(output).toContain('pages/cart.vue:12:5   web → shop   ✔ allowed');
    expect(output).toContain('ref → vue (external)');
    expect(output).toContain('web → vue');
  });

  it('separates targets with a blank line', () => {
    expect(formatWhy('x', targets, 'text', CWD)).toMatch(/\n\nref → /u);
  });

  it('emits versioned JSON keyed by the query', () => {
    const data: unknown = JSON.parse(formatWhy('useCart', targets, 'json', CWD));
    expect(data).toMatchObject({
      version: 1,
      symbol: 'useCart',
      targets: [
        {
          file: 'layers/shop/composables/useCart.ts',
          layer: 'shop',
          uses: [{ file: 'pages/index.vue', line: 3, status: 'not-allowed' }, {}],
        },
        { file: null, external: 'vue' },
      ],
    });
  });
});

describe('isWhyFormat', () => {
  it('accepts text and json only', () => {
    expect(isWhyFormat('text')).toBe(true);
    expect(isWhyFormat('github')).toBe(false);
  });
});

describe('toWhyReport', () => {
  it('matches the json format and adds absolute paths on request', () => {
    expect(`${JSON.stringify(toWhyReport('useCart', targets, CWD), null, 2)}\n`).toBe(
      formatWhy('useCart', targets, 'json', CWD),
    );
    const report = toWhyReport('useCart', targets, CWD, true);
    expect(report.targets[0]).toMatchObject({
      file: 'layers/shop/composables/useCart.ts',
      absFile: '/app/layers/shop/composables/useCart.ts',
    });
    expect(report.targets[0]?.uses[0]).toMatchObject({
      file: 'pages/index.vue',
      absFile: '/app/pages/index.vue',
    });
    expect(report.targets[1]?.absFile).toBeNull();
    expect(STATUS_LABELS['not-allowed']).toBe('✖ not allowed');
  });
});
