import { describe, expect, it } from 'vite-plus/test';

import { formatText } from '#src/report/text.ts';
import { makeFinding, makeResult } from '#test/factories.ts';

const CWD = '/app';

describe('formatText', () => {
  it('celebrates a clean run with file and layer counts', () => {
    expect(formatText(makeResult(), CWD)).toBe('✔ No problems in 2 files across 2 layers\n');
  });

  it('groups findings by file with rule, severity and details', () => {
    const result = makeResult({
      findings: [
        makeFinding({ allowed: ['shared'] }),
        makeFinding({ rule: 'unresolved-reference', severity: 'warn', line: 10, target: null }),
      ],
    });
    const output = formatText(result, CWD);
    expect(output).toContain('pages/index.vue\n');
    expect(output).toContain('3:5     error  Auto-import "useCart" crosses');
    expect(output).toContain('layer-boundary\n');
    expect(output).toContain('useCart → layers/shop/composables/useCart.ts');
    expect(output).toContain('allowed for "web": shared');
    expect(output).toContain('10:5    warn   ');
    expect(output.endsWith('✖ 2 problems (1 error, 1 warning)\n')).toBe(true);
  });

  it('says when a layer may use no other layer', () => {
    const output = formatText(makeResult({ findings: [makeFinding({ allowed: [] })] }), CWD);
    expect(output).toContain('allowed for "web": no other layers');
  });
});

describe('formatText with a baseline', () => {
  it('reports baselined findings and entries that can be removed', () => {
    const result = makeResult({
      baseline: {
        file: '/app/.layerscope-baseline.json',
        suppressed: [makeFinding()],
        removable: [
          {
            rule: 'layer-boundary',
            file: 'pages/old.vue',
            symbol: 'useOld',
            toLayer: 'shop',
            count: 2,
          },
        ],
      },
    });
    const output = formatText(result, CWD);
    expect(output).toContain(
      '.layerscope-baseline.json: 1 fixed entry. Run "layerscope check --update-baseline" to remove it.',
    );
    expect(output).toContain('pages/old.vue  layer-boundary useOld → shop (×2)');
    expect(output).toContain('✔ No problems in 2 files across 2 layers, 1 more in the baseline');
  });
});
