import { describe, expect, it } from 'vite-plus/test';

import {
  applyBaseline,
  applyBaselineFile,
  baselineSize,
  createBaseline,
  diffBaselines,
  keyOf,
  parseBaseline,
} from '#src/baseline/index.ts';
import type { Baseline } from '#src/baseline/index.ts';
import { describeEntry } from '#src/report/baseline.ts';
import { fingerprints } from '#src/report/fingerprint.ts';
import { cycleFindings } from '#src/rules/layer-cycle.ts';
import type { AnalyzeResult, Edge, Finding } from '#src/types.ts';
import { makeEdge, makeFinding, makeResult } from '#test/factories.ts';
import { tempDir, write } from '#test/watch-project.ts';

const ROOT = '/r';
const CONFIG = { rules: { 'layer-cycle': 'error' } } as never;

function edge(file: string, from: string, to: string): Edge {
  return makeEdge({ file: `${ROOT}/${file}`, fromLayer: from, toLayer: to });
}

const run = (edges: Edge[]): Finding[] => cycleFindings(edges, CONFIG);
const BASE = [
  edge('AccountMenu.vue', 'auth', 'shop'),
  edge('ZGift.vue', 'auth', 'shop'),
  edge('Cart.vue', 'shop', 'auth'),
];

function live(edges: Edge[], baseline: Baseline): string[] {
  return applyBaseline(run(edges), baseline, 'b.json', ROOT).findings.map(finding => finding.file);
}

describe('a baselined layer cycle', () => {
  const baseline = createBaseline(run(BASE), ROOT);

  it('is accepted again with the same files', () => {
    expect(live(BASE, baseline)).toEqual([]);
  });

  it('stays accepted when the file of its first use is deleted', () => {
    expect(live(BASE.slice(1), baseline)).toEqual([]);
  });

  it('stays accepted when an earlier file gets a new use', () => {
    expect(live([edge('AAA.vue', 'auth', 'shop'), ...BASE], baseline)).toEqual([]);
  });

  it('still shows the file and line of the first use in the finding', () => {
    const [finding] = run(BASE.slice(1));
    expect(finding.file).toBe(`${ROOT}/ZGift.vue`);
  });

  it('is a new finding when the chain changes', () => {
    const other = [edge('A.vue', 'auth', 'ui'), edge('U.vue', 'ui', 'auth')];
    expect(live(other, baseline)).toEqual([`${ROOT}/A.vue`]);
  });

  it('is accepted by an entry that an older version wrote', () => {
    const old: Baseline = {
      version: 1,
      entries: [
        { rule: 'layer-cycle', file: 'Gone.vue', symbol: 'auth → shop → auth', toLayer: 'shop' },
      ],
    };
    expect(live(BASE, old)).toEqual([]);
    expect(applyBaseline(run(BASE), old, 'b.json', ROOT).baseline.removable).toEqual([]);
  });

  it('lists an entry as fixed when the cycle is gone', () => {
    const result = applyBaseline(run(BASE.slice(0, 2)), baseline, 'b.json', ROOT);
    expect(result.baseline.removable.map(entry => entry.symbol)).toEqual(['auth → shop → auth']);
  });
});

describe('a key', () => {
  it('has no file for a layer-cycle entry', () => {
    const a = { rule: 'layer-cycle', file: 'a.vue', symbol: 'a → b → a', toLayer: 'b' } as const;
    expect(keyOf(a)).toBe(keyOf({ ...a, file: 'z.vue' }));
  });

  it('keeps the file for other rules', () => {
    const a = { rule: 'layer-boundary', file: 'a.vue', symbol: 'useX', toLayer: 'b' } as const;
    expect(keyOf(a)).not.toBe(keyOf({ ...a, file: 'z.vue' }));
  });
});

describe('describeEntry', () => {
  it('does not add the target layer to a cycle', () => {
    expect(
      describeEntry({ rule: 'layer-cycle', file: 'a.vue', symbol: 'a → b → a', toLayer: 'b' }),
    ).toBe('layer-cycle a → b → a');
  });

  it('keeps the target layer and the count for other rules', () => {
    expect(
      describeEntry({
        rule: 'layer-boundary',
        file: 'a.vue',
        symbol: 'useX',
        toLayer: 'b',
        count: 2,
      }),
    ).toBe('layer-boundary useX → b (×2)');
  });
});

describe('the fingerprint of a cycle finding', () => {
  it('does not change when the file of its first use changes', () => {
    const id = (edges: Edge[]): string[] => [
      ...fingerprints(makeResult({ rootDir: ROOT, findings: run(edges) })).values(),
    ];
    expect(id(BASE.slice(1))).toEqual(id(BASE));
  });
});

describe('a scoped run', () => {
  const baseline = createBaseline(run(BASE), ROOT);
  const only =
    (names: string[]) =>
    (file: string): boolean =>
      names.includes(file);

  function scoped(findings: Finding[], inScope: (file: string) => boolean): AnalyzeResult {
    const dir = tempDir();
    write(dir, 'b.json', JSON.stringify(baseline));
    return applyBaselineFile(makeResult({ rootDir: ROOT, findings }), `${dir}/b.json`, inScope);
  }

  it('matches a cycle finding of a file that the entry does not name', () => {
    const result = scoped(run(BASE.slice(1)), only(['ZGift.vue']));
    expect(result.findings).toEqual([]);
    expect(result.baseline?.suppressed).toHaveLength(1);
  });

  it('does not list a cycle entry as fixed when its finding is hidden by the scope', () => {
    const result = scoped([], only(['Other.vue']));
    expect(result.baseline?.removable).toEqual([]);
  });

  it('still lists entries of other rules by their file', () => {
    const entry = { rule: 'layer-boundary', file: 'in.vue', symbol: 'x', toLayer: 'b' } as const;
    const dir = tempDir();
    write(dir, 'b.json', JSON.stringify({ version: 1, entries: [entry] }));
    const result = applyBaselineFile(
      makeResult({ rootDir: ROOT }),
      `${dir}/b.json`,
      only(['in.vue']),
    );
    expect(result.baseline?.removable).toEqual([entry]);
  });

  it('keeps a finding of another rule that is not in the baseline', () => {
    const result = applyBaseline([makeFinding()], baseline, 'b.json', ROOT);
    expect(result.findings).toHaveLength(1);
  });
});

describe('the chain of a cycle', () => {
  it('is the same for equal cycles in any order of files', () => {
    const edges = [
      edge('1.vue', 'a', 'c'),
      edge('2.vue', 'c', 'a'),
      edge('3.vue', 'a', 'b'),
      edge('4.vue', 'b', 'a'),
    ];
    const symbols = (list: Edge[]): string[] => run(list).map(finding => finding.symbol);
    expect(symbols(edges)).toEqual(['a → b → a']);
    expect(symbols(edges.toReversed())).toEqual(['a → b → a']);
  });
});

describe('a baseline file with entries for the same cycle', () => {
  const entries = [
    { rule: 'layer-cycle', file: 'A.vue', symbol: 'auth → shop → auth', toLayer: 'shop' },
    { rule: 'layer-cycle', file: 'B.vue', symbol: 'auth → shop → auth', toLayer: 'shop' },
  ];

  it('is read as one entry with the counts added up', () => {
    const merged = parseBaseline({ version: 1, entries }, 'b.json');
    expect(merged.entries).toEqual([{ ...entries[0], count: 2 }]);
  });

  it('adds up the counts that the entries already have', () => {
    const merged = parseBaseline(
      { version: 1, entries: [{ ...entries[0], count: 2 }, entries[1]] },
      'b.json',
    );
    expect(merged.entries[0].count).toBe(3);
  });

  it('lists the surplus as fixed, because a cycle is found once', () => {
    const baseline = parseBaseline({ version: 1, entries }, 'b.json');
    const result = applyBaseline(run(BASE), baseline, 'b.json', ROOT);
    expect(result.findings).toEqual([]);
    expect(result.baseline.removable.map(entry => entry.count)).toEqual([1]);
  });

  it('counts the entries once in the size of the baseline', () => {
    expect(baselineSize(parseBaseline({ version: 1, entries }, 'b.json').entries)).toBe(2);
  });

  it('writes one entry with --update-baseline', () => {
    expect(createBaseline(run(BASE), ROOT).entries).toHaveLength(1);
  });

  it('leaves entries with different keys apart', () => {
    const other = { ...entries[0], symbol: 'a → c → a' };
    expect(parseBaseline({ version: 1, entries: [entries[0], other] }, 'b.json').entries).toEqual([
      entries[0],
      other,
    ]);
  });
});

describe('identical entries of another rule', () => {
  const entry = { rule: 'layer-boundary', file: 'a.vue', symbol: 'useX', toLayer: 'shop' } as const;
  const baseline = parseBaseline({ version: 1, entries: [entry, entry] }, 'b.json');
  const finding = makeFinding({ file: `${ROOT}/a.vue`, symbol: 'useX', toLayer: 'shop' });

  it('are not merged, so they accept one finding as before', () => {
    expect(baseline.entries).toEqual([entry, entry]);
    const result = applyBaseline([finding, finding], baseline, 'b.json', ROOT);
    expect(result.findings).toHaveLength(1);
  });

  it('count twice in the size of the baseline, and do not change the drift', () => {
    expect(baselineSize(baseline.entries)).toBe(2);
    const now = createBaseline([finding], ROOT);
    expect(diffBaselines(baseline, now)).toEqual({ added: [], fixed: [] });
  });
});

describe('a baseline entry with a wrong count', () => {
  const entry = { rule: 'layer-cycle', file: 'a.vue', symbol: 'a → b → a', toLayer: 'b' };
  const read = (count: unknown): unknown =>
    parseBaseline({ version: 1, entries: [{ ...entry, count }] }, 'b.json');

  it.each([['1'], [0], [-1], [1.5], [null]])('is refused: %j', count => {
    expect(() => read(count)).toThrow('b.json: entry 0 is not a valid baseline entry');
  });

  it('is read when the count is a positive integer or not set', () => {
    expect(() => read(2)).not.toThrow();
    expect(() => parseBaseline({ version: 1, entries: [entry] }, 'b.json')).not.toThrow();
  });
});

describe('two chains with the same joined symbol', () => {
  it('are not the same cycle', () => {
    const one = {
      rule: 'layer-cycle',
      file: 'a.vue',
      symbol: 'a → b → c → a',
      toLayer: 'b',
    } as const;
    const other = { ...one, toLayer: 'b → c' };
    expect(keyOf(one)).not.toBe(keyOf(other));
    const result = applyBaseline(
      [
        makeFinding({
          rule: 'layer-cycle',
          file: `${ROOT}/a.vue`,
          symbol: one.symbol,
          toLayer: other.toLayer,
        }),
      ],
      { version: 1, entries: [one] },
      'b.json',
      ROOT,
    );
    expect(result.findings).toHaveLength(1);
  });

  it('keep the file out of the key of a cycle, as before', () => {
    const a = { rule: 'layer-cycle', file: 'a.vue', symbol: 'a → b → a', toLayer: 'b' } as const;
    expect(keyOf(a)).toBe(keyOf({ ...a, file: 'z.vue' }));
  });
});
