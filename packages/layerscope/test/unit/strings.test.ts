import { describe, expect, it } from 'vite-plus/test';

import { compareStrings, escapeRegExp, pascalCase, plural } from '#src/utils/strings.ts';

describe('pascalCase', () => {
  it('joins kebab-case words', () => {
    expect(pascalCase('base-button')).toBe('BaseButton');
  });

  it('capitalizes a single word and keeps existing PascalCase', () => {
    expect(pascalCase('card')).toBe('Card');
    expect(pascalCase('BaseCard')).toBe('BaseCard');
  });
});

describe('escapeRegExp', () => {
  it('escapes every regexp metacharacter so the text matches literally', () => {
    const text = 'a.b*c+d?e(f)[g]{h}|i^j$k\\l';
    expect(new RegExp(escapeRegExp(text), 'u').test(text)).toBe(true);
    expect(new RegExp(escapeRegExp('a.c'), 'u').test('abc')).toBe(false);
  });
});

describe('plural', () => {
  it('uses the singular only for one', () => {
    expect(plural(1, 'file')).toBe('1 file');
    expect(plural(0, 'file')).toBe('0 files');
    expect(plural(2, 'file')).toBe('2 files');
  });

  it('accepts an irregular plural', () => {
    expect(plural(1, 'entry', 'entries')).toBe('1 entry');
    expect(plural(3, 'entry', 'entries')).toBe('3 entries');
  });
});

describe('compareStrings', () => {
  it('orders by code unit, independent of locale', () => {
    expect(compareStrings('a', 'b')).toBe(-1);
    expect(compareStrings('b', 'a')).toBe(1);
    expect(compareStrings('a', 'a')).toBe(0);
    expect(compareStrings('B', 'a')).toBe(-1);
  });
});
