import { describe, expect, it } from 'vite-plus/test';

import { formatUnused, isUnusedFormat, toUnusedRows } from '#src/report/unused.ts';
import type { UnusedSymbol } from '#src/unused/index.ts';

const CWD = '/app';

const unused: UnusedSymbol[] = [
  {
    name: 'BaseCard',
    kind: 'component',
    context: null,
    file: '/app/layers/ui/app/components/BaseCard.vue',
    layer: 'ui',
    possiblyUsed: true,
  },
  {
    name: 'useThing',
    kind: 'auto-import',
    context: 'server',
    file: '/app/layers/ui/server/utils/useThing.ts',
    layer: 'ui',
    possiblyUsed: false,
  },
];

describe('formatUnused', () => {
  it('confirms when nothing is unused', () => {
    expect(formatUnused([], 'text', CWD)).toBe('✔ Every component and auto-import is referenced\n');
  });

  it('aligns columns per layer and describes each symbol', () => {
    const output = formatUnused(unused, 'text', CWD);
    expect(output).toContain('ui\n');
    expect(output).toContain(
      '  BaseCard  layers/ui/app/components/BaseCard.vue  component (possibly used at runtime)',
    );
    expect(output).toContain('auto-import (server)');
    expect(output.endsWith('2 unused symbols in 1 layer\n')).toBe(true);
  });

  it('defaults the auto-import context to app', () => {
    const output = formatUnused([{ ...unused[1], context: null }], 'text', CWD);
    expect(output).toContain('auto-import (app)');
  });

  it('emits versioned JSON with relative files', () => {
    const data: unknown = JSON.parse(formatUnused(unused, 'json', CWD));
    expect(data).toMatchObject({
      version: 1,
      unused: [{ file: 'layers/ui/app/components/BaseCard.vue' }, {}],
    });
  });
});

describe('isUnusedFormat', () => {
  it('accepts text and json only', () => {
    expect(isUnusedFormat('json')).toBe(true);
    expect(isUnusedFormat('github')).toBe(false);
  });
});

describe('toUnusedRows', () => {
  it('makes paths relative and adds absolute paths on request', () => {
    expect(toUnusedRows(unused, CWD)[0]).toEqual({
      ...unused[0],
      file: 'layers/ui/app/components/BaseCard.vue',
    });
    expect(toUnusedRows(unused, CWD, true)[1]).toMatchObject({
      file: 'layers/ui/server/utils/useThing.ts',
      absFile: '/app/layers/ui/server/utils/useThing.ts',
    });
  });
});
