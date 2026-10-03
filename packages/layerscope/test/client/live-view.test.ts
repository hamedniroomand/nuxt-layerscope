import { describe, expect, it } from 'vite-plus/test';

import { filterFindings, rowIds } from '#src/devtools/client/lib/filters.ts';
import { describeEvent } from '#src/devtools/client/lib/live-view.ts';
import { emptyQuery } from '#src/devtools/client/lib/router.ts';
import type { LiveEvent } from '#src/devtools/live.ts';
import { tabFinding } from '#test/client/fixtures.ts';

function event(overrides: Partial<LiveEvent>): LiveEvent {
  return {
    id: 'a',
    rev: 1,
    marker: 0,
    analyzedAt: 0,
    durationMs: 1,
    summary: { errors: 0, warnings: 0 },
    delta: { added: [], removed: [] },
    newCount: 0,
    ...overrides,
  };
}

describe('live toast text', () => {
  it('says what changed and how many findings are new', () => {
    const delta = { added: [{ key: 'a', count: 2 }], removed: [{ key: 'b', count: 1 }] };
    expect(describeEvent(event({ delta, newCount: 3 }))).toBe(
      '+2 violations, -1 fixed · 3 new since opened',
    );
    expect(describeEvent(event({ delta: { added: [], removed: [{ key: 'b', count: 1 }] } }))).toBe(
      '-1 fixed',
    );
    expect(describeEvent(event({}))).toBeNull();
  });
});

describe('row identity', () => {
  it('numbers rows that share a key, so a fixed row leaves the other ids alone', () => {
    const first = tabFinding({ line: 3 });
    const second = tabFinding({ line: 9 });
    const other = tabFinding({ key: 'other' });
    const ids = rowIds([first, other, second]);
    expect([ids.get(first), ids.get(second), ids.get(other)]).toEqual([
      `${first.key}#0`,
      `${first.key}#1`,
      'other#0',
    ]);
    expect(rowIds([first, other]).get(other)).toBe('other#0');
  });

  it('keeps only new findings when asked', () => {
    const findings = [tabFinding(), tabFinding({ isNew: true, symbol: 'useTotal' })];
    expect(filterFindings(findings, { ...emptyQuery(), onlyNew: true })).toEqual([findings[1]]);
  });
});
