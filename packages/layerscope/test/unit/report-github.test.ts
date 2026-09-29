import { describe, expect, it } from 'vite-plus/test';

import { formatGithub } from '#src/report/github.ts';
import { makeFinding, makeResult } from '#test/factories.ts';

const CWD = '/app';

describe('formatGithub', () => {
  it('is empty without findings', () => {
    expect(formatGithub(makeResult(), CWD)).toBe('');
  });

  it('emits one workflow command per finding with its position', () => {
    const result = makeResult({
      findings: [makeFinding(), makeFinding({ severity: 'warn', line: 8 })],
    });
    const lines = formatGithub(result, CWD).trimEnd().split('\n');
    expect(lines[0]).toBe(
      '::error file=pages/index.vue,line=3,col=5,title=layerscope layer-boundary::Auto-import "useCart" crosses from layer "web" into "shop"%0AuseCart → layers/shop/composables/useCart.ts',
    );
    expect(lines[1]).toContain('::warning file=pages/index.vue,line=8,');
  });

  it('escapes special characters so a message cannot inject commands', () => {
    const result = makeResult({
      findings: [makeFinding({ file: '/app/a,b:c.vue', message: '100%\nnew line', target: null })],
    });
    expect(formatGithub(result, CWD)).toBe(
      '::error file=a%2Cb%3Ac.vue,line=3,col=5,title=layerscope layer-boundary::100%25%0Anew line\n',
    );
  });

  it('adds a notice for baseline entries that can be removed', () => {
    const result = makeResult({
      baseline: {
        file: '/app/.layerscope-baseline.json',
        suppressed: [],
        removable: [
          { rule: 'layer-boundary', file: 'pages/old.vue', symbol: 'useOld', toLayer: 'shop' },
        ],
      },
    });
    expect(formatGithub(result, CWD)).toBe(
      '::notice file=.layerscope-baseline.json,title=layerscope baseline::Fixed baseline entry in pages/old.vue: layer-boundary useOld → shop. Run "layerscope check --update-baseline" to remove it.\n',
    );
  });
});
