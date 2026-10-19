import { describe, expect, it } from 'vite-plus/test';

import { fingerprints } from '#src/report/fingerprint.ts';
import type { Finding } from '#src/types.ts';
import { makeFinding, makeResult } from '#test/factories.ts';

/** The ids of `findings`, given to the report in that order, in the order of `findings`. */
function ids(findings: Finding[], order: Finding[]): (string | undefined)[] {
  const map = fingerprints(makeResult({ findings: order }));
  return findings.map(finding => map.get(finding));
}

describe('the fingerprint of two findings of one use', () => {
  it('stays with the finding when the order of the targets changes', () => {
    const a = makeFinding({ target: '/app/layers/shop/components/A.vue' });
    const b = makeFinding({ target: '/app/layers/shop/components/B.vue' });
    const first = ids([a, b], [a, b]);
    expect(new Set(first).size).toBe(2);
    expect(ids([a, b], [b, a])).toEqual(first);
  });

  it('stays with the finding when only the message differs', () => {
    const a = makeFinding({ message: 'first' });
    const b = makeFinding({ message: 'second' });
    expect(ids([a, b], [b, a])).toEqual(ids([a, b], [a, b]));
  });

  it('keeps a live finding before a suppressed one with the same fields', () => {
    const live = makeFinding();
    const accepted = makeFinding();
    const result = makeResult({
      findings: [live],
      baseline: { file: '/app/layerscope-baseline.json', suppressed: [accepted], removable: [] },
    });
    const map = fingerprints(result);
    const alone = fingerprints(makeResult({ findings: [live] }));
    expect(map.get(live)).toBe(alone.get(live));
    expect(map.get(accepted)).not.toBe(map.get(live));
  });
});

describe('the fingerprint of a tied pair that the baseline accepts in part', () => {
  it('gives the live finding and the suppressed finding the same ids in both orders', () => {
    const a = makeFinding({ target: '/app/layers/shop/components/A.vue' });
    const b = makeFinding({ target: '/app/layers/shop/components/B.vue' });
    const run = (live: Finding, accepted: Finding): (string | undefined)[] => {
      const map = fingerprints(
        makeResult({
          findings: [live],
          baseline: {
            file: '/app/layerscope-baseline.json',
            suppressed: [accepted],
            removable: [],
          },
        }),
      );
      return [map.get(live), map.get(accepted)];
    };
    // The baseline accepts the first of the two in the input order, so the live one changes.
    expect(run(b, a)).toEqual(run(a, b));
  });

  it('keeps the numbers of a key with a live and a suppressed finding at other lines', () => {
    const accepted = makeFinding({ line: 1, target: '/z.ts' });
    const live = makeFinding({ line: 9, target: '/a.ts' });
    const map = fingerprints(
      makeResult({
        findings: [live],
        baseline: { file: '/app/layerscope-baseline.json', suppressed: [accepted], removable: [] },
      }),
    );
    const alone = fingerprints(makeResult({ findings: [accepted, live] }));
    expect([map.get(accepted), map.get(live)]).toEqual([alone.get(accepted), alone.get(live)]);
  });
});
