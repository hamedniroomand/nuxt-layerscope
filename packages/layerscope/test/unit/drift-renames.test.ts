import { describe, expect, it } from 'vite-plus/test';

import { mapToBase } from '#src/drift/renames.ts';
import { makeFinding } from '#test/factories.ts';

describe('mapToBase', () => {
  it('keeps the path through the link for an import through a link name with a dot', () => {
    const finding = makeFinding({
      rule: 'layer-boundary',
      file: '/r/a/f.ts',
      symbol: './x.v2',
      toLayer: null,
      target: '/r/a/real/foo.ts',
    });
    const renames = new Map([['a/f.ts', { from: 'b/f.ts', score: 100 }]]);
    const { findings } = mapToBase([finding], renames, '/r', []);
    expect(findings.map(({ file, symbol }) => [file, symbol])).toEqual([
      ['/r/b/f.ts', '../a/x.v2'],
    ]);
  });
});
