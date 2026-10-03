import { beforeAll, describe, expect, it } from 'vite-plus/test';

import { analyze } from '#src/analyze/index.ts';
import { listSymbols, traceView, unusedView } from '#src/devtools/views-api.ts';
import { formatUnused } from '#src/report/unused.ts';
import { formatWhy } from '#src/report/why.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { findUnused } from '#src/unused/index.ts';
import { findUses } from '#src/why/index.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

let result: AnalyzeResult;

beforeAll(async () => {
  result = await analyze({ rootDir: NUXT4_ROOT });
}, 60_000);

describe('trace and unused views on the nuxt4 fixture', () => {
  it('matches `layerscope why useCart`', async () => {
    const view = await traceView(result, 'useCart');
    const cli = JSON.parse(
      formatWhy('useCart', findUses(result, 'useCart', result.config), 'json', NUXT4_ROOT),
    ) as typeof view;
    expect(view.targets.map(target => target.uses.map(use => use.status))).toEqual(
      cli.targets.map(target => target.uses.map(use => use.status)),
    );
    expect(view.targets[0]?.uses[0]?.absFile).toMatch(/^\//u);
    expect((await traceView(result, '')).targets).toEqual([]);
    expect((await traceView(result, 'NoSuchThing')).targets).toEqual([]);
  });

  it('matches `layerscope unused`', async () => {
    const view = await unusedView(result);
    const cli = JSON.parse(formatUnused(findUnused(result), 'json', NUXT4_ROOT)) as {
      unused: { name: string; file: string }[];
    };
    expect(view.unused.map(row => [row.name, row.file])).toEqual(
      cli.unused.map(row => [row.name, row.file]),
    );
  });

  it('lists the names the trace accepts', () => {
    const symbols = listSymbols(result);
    expect(symbols.some(symbol => symbol.name.startsWith('Lazy'))).toBe(false);
    const useCart = symbols.find(symbol => symbol.name === 'useCart');
    expect(useCart).toMatchObject({ kind: 'auto-import', layer: 'web', contexts: ['app'] });
    expect(symbols.map(symbol => symbol.name)).toEqual(
      symbols.map(symbol => symbol.name).toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    );
  });
});
