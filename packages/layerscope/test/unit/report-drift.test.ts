import { describe, expect, it } from 'vite-plus/test';

import type { Drift } from '#src/drift/index.ts';
import { formatDrift, isDriftFormat } from '#src/report/drift.ts';
import type { BaselineEntry } from '#src/types.ts';

const entry = (overrides: Partial<BaselineEntry> = {}): BaselineEntry => ({
  rule: 'layer-boundary',
  file: 'pages/index.vue',
  symbol: 'useCart',
  toLayer: 'shop',
  ...overrides,
});

const drift = (overrides: Partial<Drift> = {}): Drift => ({
  base: 'main',
  added: [],
  fixed: [],
  baselineSize: { base: 2, current: 1 },
  ...overrides,
});

describe('isDriftFormat', () => {
  it('accepts the known formats', () => {
    expect(isDriftFormat('text')).toBe(true);
    expect(isDriftFormat('markdown')).toBe(true);
    expect(isDriftFormat('json')).toBe(true);
    expect(isDriftFormat('yaml')).toBe(false);
  });
});

describe('formatDrift', () => {
  it('prints a text summary with the baseline trend', () => {
    expect(formatDrift(drift(), 'text')).toBe(
      'adds 0, fixes 0 against main\nBaseline: 2 → 1 (−1)\n',
    );
  });

  it('lists added and fixed entries', () => {
    const text = formatDrift(
      drift({ added: [entry()], fixed: [entry({ symbol: 'useUser', toLayer: null })] }),
      'text',
    );
    expect(text).toContain('Added:');
    expect(text).toContain('pages/index.vue  layer-boundary useCart → shop');
    expect(text).toContain('Fixed:');
    expect(text).toContain('layer-boundary useUser');
  });

  it('prints markdown with headings and bullets', () => {
    const text = formatDrift(drift({ added: [entry({ count: 2 })] }), 'markdown');
    expect(text).toContain('### layerscope');
    expect(text).toContain('**adds 2, fixes 0** against `main`');
    expect(text).toContain('- pages/index.vue  layer-boundary useCart → shop (×2)');
  });

  it('prints json with adds and fixes counts', () => {
    const report: unknown = JSON.parse(formatDrift(drift({ added: [entry()] }), 'json'));
    expect(report).toMatchObject({ base: 'main', adds: 1, fixes: 0 });
    expect(formatDrift(drift(), 'json').endsWith('}\n')).toBe(true);
  });
});
