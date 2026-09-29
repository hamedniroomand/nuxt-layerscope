import { describe, expect, it } from 'vite-plus/test';

import { lineColumn, offsetAt } from '#src/utils/position.ts';

const SOURCE = 'ab\ncde\n\nf';

describe('lineColumn', () => {
  it('is 1-based on the first line', () => {
    expect(lineColumn(SOURCE, 0)).toEqual({ line: 1, column: 1 });
    expect(lineColumn(SOURCE, 1)).toEqual({ line: 1, column: 2 });
  });

  it('counts lines after each newline, including empty ones', () => {
    expect(lineColumn(SOURCE, 3)).toEqual({ line: 2, column: 1 });
    expect(lineColumn(SOURCE, 7)).toEqual({ line: 3, column: 1 });
    expect(lineColumn(SOURCE, 8)).toEqual({ line: 4, column: 1 });
  });

  it('places the newline itself at the end of its line', () => {
    expect(lineColumn(SOURCE, 2)).toEqual({ line: 1, column: 3 });
  });
});

describe('offsetAt', () => {
  it('is the inverse of lineColumn for every offset', () => {
    for (let offset = 0; offset < SOURCE.length; offset += 1) {
      expect(offsetAt(SOURCE, lineColumn(SOURCE, offset))).toBe(offset);
    }
  });
});
