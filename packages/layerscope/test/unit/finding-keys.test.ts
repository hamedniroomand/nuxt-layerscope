import { describe, expect, it } from 'vite-plus/test';

import { countKeys, diffKeys, findingKey, markNew } from '#src/devtools/finding-keys.ts';
import { makeFinding } from '#test/factories.ts';

describe('finding keys', () => {
  it('keys a finding by rule, relative file, symbol and target layer, not by line', () => {
    const key = findingKey(makeFinding(), '/app');
    expect(key).toBe('layer-boundary\0pages/index.vue\0useCart\0shop');
    expect(findingKey(makeFinding({ line: 40 }), '/app')).toBe(key);
    expect(findingKey(makeFinding({ toLayer: null }), '/app')).toBe(
      'layer-boundary\0pages/index.vue\0useCart\0',
    );
  });

  it('counts findings as a multiset and diffs the counts both ways', () => {
    const two = countKeys([makeFinding(), makeFinding({ line: 9 })], '/app');
    const one = countKeys([makeFinding(), makeFinding({ symbol: 'useTotal' })], '/app');
    const cart = findingKey(makeFinding(), '/app');
    const total = findingKey(makeFinding({ symbol: 'useTotal' }), '/app');
    expect(two.get(cart)).toBe(2);
    expect(diffKeys(two, one)).toEqual({
      added: [{ key: total, count: 1 }],
      removed: [{ key: cart, count: 1 }],
    });
    expect(diffKeys(one, one)).toEqual({ added: [], removed: [] });
  });

  it('marks occurrences beyond the marker count as new, in report order', () => {
    const marker = new Map([['a', 1]]);
    expect(markNew(['a', 'b', 'a'], marker)).toEqual([false, true, true]);
    expect(markNew(['a'], marker)).toEqual([false]);
  });
});
