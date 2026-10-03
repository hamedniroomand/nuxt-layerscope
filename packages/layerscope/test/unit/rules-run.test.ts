import { describe, expect, it } from 'vite-plus/test';

import { compareByPosition } from '#src/rules/compare.ts';
import { runRules } from '#src/rules/index.ts';
import { SHADOWED_NEEDS_REGISTRY } from '#src/rules/shadowed-component.ts';
import { makeEdge, makeFinding } from '#test/factories.ts';

const noOwner = (): null => null;

describe('compareByPosition', () => {
  it('orders by file, line, column, rule and symbol', () => {
    const findings = [
      makeFinding({ file: '/b.vue' }),
      makeFinding({ line: 9 }),
      makeFinding({ column: 9 }),
      makeFinding({ symbol: 'zzz' }),
      makeFinding({ rule: 'unresolved-reference' }),
      makeFinding({ line: 1 }),
    ];
    const sorted = findings.toSorted(compareByPosition);
    expect(sorted.map(f => [f.file, f.line, f.column, f.rule, f.symbol])).toEqual([
      ['/app/pages/index.vue', 1, 5, 'layer-boundary', 'useCart'],
      ['/app/pages/index.vue', 3, 5, 'layer-boundary', 'zzz'],
      ['/app/pages/index.vue', 3, 5, 'unresolved-reference', 'useCart'],
      ['/app/pages/index.vue', 3, 9, 'layer-boundary', 'useCart'],
      ['/app/pages/index.vue', 9, 5, 'layer-boundary', 'useCart'],
      ['/b.vue', 3, 5, 'layer-boundary', 'useCart'],
    ]);
  });
});

describe('runRules', () => {
  const config = { layers: { web: { allow: [] } } };

  it('merges unresolved and boundary findings in report order', async () => {
    const unresolved = makeFinding({ rule: 'unresolved-reference', severity: 'warn', line: 1 });
    const { findings } = await runRules({
      edges: [makeEdge({ line: 2 })],
      unresolved: [unresolved],
      registry: null,
      layers: [],
      rootDir: '/',
      ownerOf: noOwner,
      config: { ...config, rules: { 'shadowed-component': 'off' } },
    });
    expect(findings.map(f => f.rule)).toEqual(['unresolved-reference', 'layer-boundary']);
  });

  it('notes that shadowed-component could not run without a registry', async () => {
    const input = {
      edges: [],
      unresolved: [],
      registry: null,
      layers: [],
      rootDir: '/',
      ownerOf: noOwner,
      config,
    };
    expect((await runRules(input)).notes).toEqual([SHADOWED_NEEDS_REGISTRY]);
    const off = { ...config, rules: { 'shadowed-component': 'off' as const } };
    expect((await runRules({ ...input, config: off })).notes).toEqual([]);
  });
});
