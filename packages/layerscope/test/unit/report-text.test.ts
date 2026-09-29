import { describe, expect, it } from 'vite-plus/test';

import { formatText } from '#src/report/text.ts';
import type { Paint } from '#src/utils/style.ts';
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

  it('lists files with errors last, keeping the order within each group', () => {
    const result = makeResult({
      findings: [
        makeFinding({ file: '/app/a.vue' }),
        makeFinding({ file: '/app/b.vue', severity: 'warn' }),
        makeFinding({ file: '/app/c.vue' }),
        makeFinding({ file: '/app/d.vue', severity: 'warn' }),
      ],
    });
    const files = formatText(result, CWD).match(/^[a-d]\.vue$/gmu);
    expect(files).toEqual(['b.vue', 'd.vue', 'a.vue', 'c.vue']);
  });

  it('says when a layer may use no other layer', () => {
    const output = formatText(makeResult({ findings: [makeFinding({ allowed: [] })] }), CWD);
    expect(output).toContain('allowed for "web": no other layers');
  });
});

describe('formatText with colors', () => {
  const tag: Paint = (format, text) => `<${String(format)}>${text}</>`;

  it('colors severities, the rule and the summary', () => {
    const result = makeResult({
      findings: [makeFinding(), makeFinding({ severity: 'warn', line: 9 })],
    });
    const output = formatText(result, CWD, tag);
    expect(output).toContain('<red>error</>  Auto-import');
    expect(output).toContain('<yellow>warn</>   Auto-import');
    expect(output).toContain('<dim>layer-boundary</>');
    expect(output).toContain('<underline>pages/index.vue</>');
    expect(output).toContain('<bold,red>✖ 2 problems (1 error, 1 warning)</>');
  });

  it('colors a summary of warnings only in yellow and a clean run in green', () => {
    const warnings = makeResult({ findings: [makeFinding({ severity: 'warn' })] });
    expect(formatText(warnings, CWD, tag)).toContain('<bold,yellow>✖ 1 problem');
    expect(formatText(makeResult(), CWD, tag)).toContain('<green,bold>✔ No problems');
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
