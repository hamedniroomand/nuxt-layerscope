import { describe, expect, it } from 'vite-plus/test';

import { formatJson, JSON_REPORT_VERSION } from '#src/report/json.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { makeFinding, makeResult } from '#test/factories.ts';

const CWD = '/app';

function report(result: AnalyzeResult = makeResult()): unknown {
  return JSON.parse(formatJson(result, CWD));
}

describe('formatJson', () => {
  it('ends with a newline and carries the report version', () => {
    expect(formatJson(makeResult(), CWD).endsWith('}\n')).toBe(true);
    expect(report()).toMatchObject({ version: JSON_REPORT_VERSION });
  });

  it('lists layers with roots relative to the working directory', () => {
    expect(report()).toMatchObject({
      layers: [
        { name: 'web', root: '.' },
        { name: 'shop', root: 'layers/shop' },
      ],
    });
  });

  it('summarizes files and findings and relativizes their paths', () => {
    const result = makeResult({
      findings: [makeFinding(), makeFinding({ severity: 'warn', target: null })],
    });
    expect(report(result)).toMatchObject({
      summary: { files: 2, errors: 1, warnings: 1 },
      findings: [
        { file: 'pages/index.vue', target: 'layers/shop/composables/useCart.ts' },
        { file: 'pages/index.vue', target: null },
      ],
    });
  });

  it('includes the baseline only when one was applied', () => {
    expect(report()).not.toHaveProperty('baseline');
    const baseline = {
      file: '/app/.layerscope-baseline.json',
      suppressed: [makeFinding()],
      removable: [],
    };
    expect(report(makeResult({ baseline }))).toMatchObject({
      baseline: { file: '.layerscope-baseline.json', suppressed: [{ file: 'pages/index.vue' }] },
    });
  });
});
