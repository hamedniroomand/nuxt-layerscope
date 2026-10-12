import { describe, expect, it } from 'vite-plus/test';

import { countOtherFindings, planMoves } from '#src/fix/plan.ts';
import type { AnalyzeResult, Edge, Suggestion } from '#src/types.ts';
import { makeEdge, makeFinding, makeResult } from '#test/factories.ts';

const OLD = '/app/layers/web/composables/useCart.ts';
const NEW = '/app/layers/shared/composables/useCart.ts';

const move: Suggestion = {
  action: 'move',
  message: 'move it',
  layer: 'shared',
  file: NEW,
  impact: { fixes: 1 },
};

function result(edges: Edge[], suggestion: Suggestion = move): AnalyzeResult {
  return makeResult({
    edges,
    findings: [makeFinding({ target: OLD, suggestion })],
  });
}

const use = (overrides: Partial<Edge>): Edge =>
  makeEdge({ kind: 'import', to: OLD, toLayer: 'web', ...overrides });

describe('planMoves', () => {
  it('plans nothing without a move suggestion', () => {
    expect(planMoves(result([], { ...move, action: 'allow' }))).toEqual([]);
  });

  it('plans the move and rewrites a relative import of the moved file', () => {
    const edge = use({
      file: '/app/layers/shop/pages/shop.vue',
      symbol: '../../web/composables/useCart',
    });
    const [plan] = planMoves(result([edge]));
    expect(plan).toMatchObject({ from: OLD, to: NEW, layer: 'shared', fixes: 1 });
    expect(plan.updates).toEqual([
      {
        file: edge.file,
        line: 3,
        column: 5,
        specifier: '../../web/composables/useCart',
        updated: '../../shared/composables/useCart',
      },
    ]);
  });
});

describe('planMoves: edits', () => {
  it('does not list a symbol that is not text in the source', () => {
    const [plan] = planMoves(
      result([
        use({ symbol: '#imports:useCart' }),
        use({ kind: 'auto-import', symbol: 'useCart' }),
        use({ kind: 'component', symbol: 'CartBadge' }),
      ]),
    );
    expect(plan.updates).toEqual([]);
  });
});

describe('planMoves: aliases', () => {
  it('lists an alias that points at the moved file as an edit by hand', () => {
    const [plan] = planMoves(result([use({ symbol: '#layers/web/composables/useCart' })]));
    expect(plan.updates).toMatchObject([
      { specifier: '#layers/web/composables/useCart', updated: null },
    ]);
  });

  it('does not list an alias in the moved file that resolves to the same file', () => {
    const other = '/app/shared/format.ts';
    const edge = makeEdge({
      file: OLD,
      kind: 'import',
      symbol: '~~/shared/format',
      to: other,
      toLayer: 'root',
      fromLayer: 'web',
    });
    const [plan] = planMoves(result([edge]));
    expect(plan.updates).toEqual([]);
  });

  it('rewrites a relative import in the moved file itself', () => {
    const edge = makeEdge({
      file: OLD,
      kind: 'import',
      symbol: './helper',
      to: '/app/layers/web/composables/helper.ts',
      toLayer: 'web',
      fromLayer: 'web',
    });
    const [plan] = planMoves(result([edge]));
    expect(plan.updates).toMatchObject([
      { file: OLD, specifier: './helper', updated: '../../web/composables/helper' },
    ]);
  });
});

describe('planMoves: several moves', () => {
  it('plans more than one move, and rewrites an import between two moved files once', () => {
    const second = '/app/layers/web/composables/useTotal.ts';
    const secondNew = '/app/layers/shared/composables/useTotal.ts';
    const edge = makeEdge({
      file: OLD,
      kind: 'import',
      symbol: './useTotal',
      to: second,
      toLayer: 'web',
      fromLayer: 'web',
    });
    const plans = planMoves(
      makeResult({
        edges: [edge],
        findings: [
          makeFinding({ target: OLD, suggestion: move }),
          makeFinding({
            target: second,
            suggestion: { ...move, file: secondNew },
          }),
        ],
      }),
    );
    expect(plans.map(plan => plan.to)).toEqual([NEW, secondNew]);
    // Both files move together, so the relative path between them does not change.
    expect(plans.flatMap(plan => plan.updates)).toEqual([]);
  });
});

describe('countOtherFindings', () => {
  it('counts each finding that no planned move clears, of every rule', () => {
    const findings = [
      makeFinding({ target: OLD, suggestion: move }),
      // A move of the file clears this one too, whatever its own suggestion is.
      makeFinding({
        rule: 'layer-internal',
        target: OLD,
        suggestion: { ...move, action: 'expose' },
      }),
      makeFinding({ suggestion: { ...move, action: 'allow' } }),
      makeFinding({ rule: 'layer-cycle', target: null }),
      makeFinding({ rule: 'unresolved-reference', target: null }),
      makeFinding({ rule: 'shadowed-component', target: OLD }),
    ];
    const outcome = makeResult({ findings });
    expect(countOtherFindings(outcome, planMoves(outcome))).toBe(4);
  });
});
