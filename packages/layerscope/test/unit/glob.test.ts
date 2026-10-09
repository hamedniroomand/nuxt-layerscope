import { describe, expect, it } from 'vite-plus/test';

import { matchesGlob } from '#src/utils/glob.ts';

describe('matchesGlob', () => {
  it('matches everything below a directory with **', () => {
    expect(matchesGlob('app/composables/**', 'app/composables/cart/useCart.ts')).toBe(true);
    expect(matchesGlob('app/composables/**', 'app/utils/a.ts')).toBe(false);
    expect(matchesGlob('**/useCart.ts', 'useCart.ts')).toBe(true);
    expect(matchesGlob('**/useCart.ts', 'app/composables/useCart.ts')).toBe(true);
  });

  it('keeps * and ? inside one segment', () => {
    expect(matchesGlob('app/*.ts', 'app/a.ts')).toBe(true);
    expect(matchesGlob('app/*.ts', 'app/b/a.ts')).toBe(false);
    expect(matchesGlob('app/use?.ts', 'app/useA.ts')).toBe(true);
    expect(matchesGlob('app/use?.ts', 'app/use/.ts')).toBe(false);
  });

  it.each([
    ['app/a.b.ts', 'app/aXb.ts'],
    ['app/(group)/a.ts', 'app/group/a.ts'],
    ['app/[id].vue', 'app/i.vue'],
    ['app/a+b.ts', 'app/aab.ts'],
    ['app/a|b.ts', 'app/a.ts'],
    ['app/$x.ts', 'app/x.ts'],
    ['app/^x.ts', 'app/x.ts'],
    ['app/{a,b}.ts', 'app/a.ts'],
  ])('treats the other characters of %s as literal text', (glob, other) => {
    expect(matchesGlob(glob, glob)).toBe(true);
    expect(matchesGlob(glob, other)).toBe(false);
  });
});
