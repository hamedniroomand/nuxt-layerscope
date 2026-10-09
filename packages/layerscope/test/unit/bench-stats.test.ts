import { describe, expect, it } from 'vite-plus/test';

import {
  formatDuration,
  formatTable,
  megabytes,
  median,
  parseBenchArgs,
  summarize,
} from '#bench/stats.ts';

describe('median and summarize', () => {
  it('takes the middle value, or the mean of the two in the middle', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([5])).toBe(5);
    expect(median([])).toBeNaN();
  });

  it('keeps the samples with the range', () => {
    expect(summarize([30, 10, 20])).toEqual({
      median: 20,
      min: 10,
      max: 30,
      samples: [30, 10, 20],
    });
  });
});

describe('units', () => {
  it('turns kilobytes into megabytes', () => {
    expect(megabytes(2048)).toBe(2);
  });

  it('writes milliseconds, and seconds from a second on', () => {
    expect(formatDuration(820.4)).toBe('820 ms');
    expect(formatDuration(4200)).toBe('4.2 s');
  });
});

describe('formatTable', () => {
  it('writes a row for each scenario, with the range and the memory', () => {
    const table = formatTable([
      { scenario: 'A', time: summarize([700, 900, 800]), memory: summarize([200, 210, 205]) },
      {
        scenario: 'B',
        time: summarize([2000]),
        note: 'memory of the layerscope process only',
      },
    ]);
    expect(table).toContain('| A | 800 ms | 700 ms to 900 ms | 205 MB |');
    expect(table).toContain('| B | 2.0 s | 2.0 s to 2.0 s | not included |');
    expect(table).toContain('- B: memory of the layerscope process only.');
  });
});

describe('parseBenchArgs', () => {
  it('has defaults', () => {
    expect(parseBenchArgs([])).toEqual({
      files: 3000,
      runs: undefined,
      project: undefined,
      json: undefined,
      only: ['A', 'B', 'C'],
      generate: true,
    });
  });

  it('reads the options', () => {
    expect(
      parseBenchArgs([
        '--files',
        '500',
        '--runs',
        '3',
        '--only',
        'a,c',
        '--no-generate',
        '--json',
        'x.json',
      ]),
    ).toMatchObject({ files: 500, runs: 3, only: ['A', 'C'], generate: false, json: 'x.json' });
  });

  it('refuses numbers that do not fit', () => {
    expect(() => parseBenchArgs(['--files', '3'])).toThrow('--files');
    expect(() => parseBenchArgs(['--runs', '0'])).toThrow('--runs');
    expect(() => parseBenchArgs(['--runs', 'many'])).toThrow('--runs');
  });
});
