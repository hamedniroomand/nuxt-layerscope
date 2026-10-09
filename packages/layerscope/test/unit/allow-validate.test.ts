import { describe, expect, it } from 'vite-plus/test';

import { validateConfig } from '#src/config/validate.ts';
import type { LayerscopeConfig } from '#src/types.ts';

const check = (layers: unknown): void => {
  validateConfig({ layers } as LayerscopeConfig, 'config');
};

describe('validateConfig for allow and expose', () => {
  it('accepts names, scoped entries and expose lists', () => {
    expect(() => {
      check({
        admin: { allow: ['shared', { layer: 'web', only: ['useCart', 'app/**'] }] },
        web: { expose: ['useCart'] },
        empty: { expose: [] },
      });
    }).not.toThrow();
  });

  it('accepts the same layer twice as plain names, as today', () => {
    expect(() => {
      check({ admin: { allow: ['shared', 'shared'] } });
    }).not.toThrow();
  });

  it.each([
    ['a scoped entry without a layer', { allow: [{ only: ['a'] }] }, 'needs a layer name'],
    ['a scoped entry without only', { allow: [{ layer: 'web' }] }, 'non-empty array'],
    ['an empty only list', { allow: [{ layer: 'web', only: [] }] }, 'non-empty array'],
    ['an only list of numbers', { allow: [{ layer: 'web', only: [1] }] }, 'non-empty array'],
    ['an unknown key', { allow: [{ layer: 'web', only: ['a'], extra: 1 }] }, 'unknown key "extra"'],
    ['a number in allow', { allow: [5] }, 'must hold layer names'],
    [
      'a plain and a scoped entry for one layer',
      { allow: ['web', { layer: 'web', only: ['a'] }] },
      'more than once',
    ],
    [
      'two scoped entries for one layer',
      {
        allow: [
          { layer: 'web', only: ['a'] },
          { layer: 'web', only: ['b'] },
        ],
      },
      'more than once',
    ],
    ['allow that is not an array', { allow: 'web' }, 'must be an array'],
    ['expose that is not an array', { expose: 'a' }, 'expose must be an array'],
    ['expose with a number', { expose: [1] }, 'expose must be an array'],
  ])('rejects %s', (_name, rule, message) => {
    expect(() => {
      check({ admin: rule });
    }).toThrow(message);
  });
});
