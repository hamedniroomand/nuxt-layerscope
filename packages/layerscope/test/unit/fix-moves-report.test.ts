import { describe, expect, it } from 'vite-plus/test';

import type { PlannedMove } from '#src/fix/types.ts';
import { formatMoves } from '#src/report/moves.ts';

const move: PlannedMove = {
  from: '/app/a/x.ts',
  to: '/app/b/x.ts',
  layer: 'b',
  fixes: 2,
  updates: [
    { file: '/app/c/y.ts', line: 4, specifier: '../a/x', updated: '../b/x' },
    { file: '/app/d/z.ts', line: 1, specifier: '#layers/a/x', updated: null },
  ],
};

const plain = { others: 0, typeImportsIgnored: false };

describe('formatMoves', () => {
  it('prints each move, its edits and the steps after it', () => {
    const text = formatMoves([move], '/app', plain);
    expect(text).toContain('a/x.ts → b/x.ts  (layer "b", clears 2 findings)');
    expect(text).toContain('c/y.ts:4  "../a/x" → "../b/x"');
    expect(text).toContain('d/z.ts:1  "#layers/a/x" — update by hand');
    expect(text).toContain(
      'Move the files, update the imports, then run `layerscope check --prepare`.',
    );
    expect(text).not.toContain('--dry-run');
  });

  it('says that test files and ignored files are not scanned', () => {
    const text = formatMoves([move], '/app', plain);
    expect(text).toContain(
      'layerscope does not scan test files, `nuxt.config.*`, the Nuxt `modules/` dir, files outside the layer source dirs, or files that match `ignore`. Update the imports of moved files in them by hand.',
    );
    expect(text).not.toContain('Type-only imports');
  });

  it('says that type-only imports are not listed when typeImports is ignore', () => {
    const text = formatMoves([move], '/app', { ...plain, typeImportsIgnored: true });
    expect(text).toContain(
      "Type-only imports are not checked (typeImports: 'ignore'), so they are not listed.",
    );
  });

  it('counts the findings that have no move', () => {
    expect(formatMoves([move], '/app', { ...plain, others: 3 })).toContain(
      '3 other findings have no file move. Run `layerscope check` to see their suggestions.',
    );
    expect(formatMoves([], '/app', { ...plain, others: 1 })).toBe(
      'No file moves suggested.\n1 other finding has no file move. Run `layerscope check` to see their suggestions.\n',
    );
  });

  it('prints only one line when there is nothing to move and nothing else', () => {
    expect(formatMoves([], '/app', plain)).toBe('No file moves suggested.\n');
  });
});
