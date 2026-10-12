import { describe, expect, it } from 'vite-plus/test';

import { applyBaseline, createBaseline } from '#src/baseline/index.ts';
import { cycleFindings } from '#src/rules/layer-cycle.ts';
import type { Edge } from '#src/types.ts';
import { makeEdge } from '#test/factories.ts';

/**
 * The promise: a baselined layer cycle stays accepted while the same layer pairs are used, whatever
 * happens to the files. The test makes small random projects with fixed seeds, baselines every
 * cycle, then deletes files and adds uses without changing the set of layer pairs.
 */

const ROOT = '/r';
const CONFIG = { rules: { 'layer-cycle': 'error' } } as never;
const SEEDS = Array.from({ length: 200 }, (_, index) => index + 1);

/** A small seeded generator (a linear congruential one), so a failure can be run again. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

interface Use {
  file: string;
  from: string;
  to: string;
}

const toEdges = (uses: Use[]): Edge[] =>
  uses.map(use => makeEdge({ file: `${ROOT}/${use.file}`, fromLayer: use.from, toLayer: use.to }));

const pairsOf = (uses: Use[]): string[] =>
  [...new Set(uses.map(use => `${use.from}>${use.to}`))].toSorted((a, b) => a.localeCompare(b));

function project(next: () => number): Use[] {
  const layers = ['a', 'b', 'c', 'd', 'e'].slice(0, 3 + Math.floor(next() * 3));
  const uses: Use[] = [];
  for (const from of layers) {
    for (const to of layers) {
      if (from !== to && next() < 0.55) {
        const count = 1 + Math.floor(next() * 3);
        for (let index = 0; index < count; index += 1) {
          uses.push({ file: `f${Math.floor(next() * 30)}.vue`, from, to });
        }
      }
    }
  }
  return uses;
}

/** Deletes files and adds uses, so that the set of layer pairs stays the same. */
function mutate(uses: Use[], next: () => number): Use[] {
  let result = uses;
  for (const file of new Set(uses.map(use => use.file))) {
    if (next() < 0.5) {
      const rest = result.filter(use => use.file !== file);
      if (pairsOf(rest).join() === pairsOf(uses).join()) {
        result = rest;
      }
    }
  }
  for (const use of uses) {
    if (next() < 0.5) {
      // Names before and after the old ones, such as `a-new` and `zz-new`.
      result = [
        ...result,
        { ...use, file: `${next() < 0.5 ? '0' : 'zz'}-new${result.length}.vue` },
      ];
    }
  }
  return result.toSorted(() => next() - 0.5);
}

/** The shortest chain through layers after `start`; of equal ones, the first by layer names. */
function bruteForce(start: string, uses: Use[]): string | null {
  const next = new Map<string, Set<string>>();
  for (const use of uses) {
    next.set(use.from, (next.get(use.from) ?? new Set()).add(use.to));
  }
  const key = (list: string[]): string => `${String(list.length).padStart(3, '0')}${list.join()}`;
  const found: { best: string[] | null } = { best: null };
  const walk = (path: string[]): void => {
    for (const layer of next.get(path.at(-1) ?? '') ?? []) {
      if (layer === start) {
        const chain = [...path, start];
        if (found.best === null || key(chain) < key(found.best)) {
          found.best = chain;
        }
      } else if (layer > start && !path.includes(layer)) {
        walk([...path, layer]);
      }
    }
  };
  walk([start]);
  return found.best?.join(' → ') ?? null;
}

describe.each(SEEDS)('cycle baseline, seed %i', seed => {
  const next = random(seed);
  const before = project(next);
  const after = mutate(before, next);
  const findingsBefore = cycleFindings(toEdges(before), CONFIG);
  const findingsAfter = cycleFindings(toEdges(after), CONFIG);

  it('keeps the chain of each cycle when only the files change', () => {
    expect(findingsAfter.map(finding => finding.symbol)).toEqual(
      findingsBefore.map(finding => finding.symbol),
    );
  });

  it('shows the shortest chain that sorts first', () => {
    for (const finding of findingsBefore) {
      expect(finding.symbol).toBe(bruteForce(finding.symbol.split(' → ')[0], before));
    }
  });

  it('accepts every baselined cycle after the change', () => {
    const baseline = createBaseline(findingsBefore, ROOT);
    const applied = applyBaseline(findingsAfter, baseline, 'b.json', ROOT);
    expect(applied.findings).toEqual([]);
    expect(applied.baseline.removable).toEqual([]);
    expect(applied.baseline.suppressed).toHaveLength(findingsBefore.length);
  });
});

it('has seeds with cycles and with equal-length ties', () => {
  const cycles = SEEDS.filter(seed => {
    const next = random(seed);
    return cycleFindings(toEdges(project(next)), CONFIG).length > 0;
  });
  expect(cycles.length).toBeGreaterThan(SEEDS.length / 2);
});
