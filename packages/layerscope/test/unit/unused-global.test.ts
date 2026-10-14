import { describe, expect, it } from 'vite-plus/test';

import { unusedView } from '#src/devtools/views-api.ts';
import { blindSpotLines, formatUnused } from '#src/report/unused.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { findBlindSpots } from '#src/unused/blind-spots.ts';
import { findUnused } from '#src/unused/index.ts';
import { makeResult } from '#test/factories.ts';

const BANNER = '/app/components/Banner.vue';
const CARD = '/app/components/Card.vue';

/** Two unused components, `Banner` and `Card`, and no file that chooses one at runtime. */
function result(overrides: Partial<AnalyzeResult> = {}): AnalyzeResult {
  return makeResult({
    symbols: {
      imports: { app: new Map(), server: new Map(), shared: new Map() },
      components: new Map([
        ['Banner', [{ file: BANNER, module: null }]],
        ['Card', [{ file: CARD, module: null }]],
      ]),
    },
    ...overrides,
  });
}

const CONTENT_LINE =
  'Nuxt Content can render any component by its name from a content file, so every component is marked "possibly used at runtime".';

describe('unused and global components (#119)', () => {
  it('marks only the global component, with no other runtime use in the project', () => {
    const unused = findUnused(result({ globalComponentFiles: [BANNER] }));
    expect(
      unused.map(({ name, global, possiblyUsed }) => ({ name, global, possiblyUsed })),
    ).toEqual([
      { name: 'Banner', global: true, possiblyUsed: true },
      { name: 'Card', global: false, possiblyUsed: false },
    ]);
  });

  it('names a global component in the text report', () => {
    const run = result({ globalComponentFiles: [BANNER] });
    const text = formatUnused(findUnused(run), 'text', '/app', findBlindSpots(run));
    expect(text).toContain('global component (possibly used at runtime)');
  });

  it('does not show the DevTools banner for a global component only', async () => {
    const view = await unusedView(result({ globalComponentFiles: [BANNER] }));
    expect(view.possiblyUsed).toBe(false);
    expect(view.unused.find(row => row.name === 'Banner')).toMatchObject({ global: true });
  });
});

describe('unused and Nuxt Content (#119)', () => {
  it('marks every component and says why in one line', () => {
    const run = result({ nuxtContent: true });
    expect(findUnused(run).map(symbol => symbol.possiblyUsed)).toEqual([true, true]);
    expect(findBlindSpots(run)).toContainEqual({ kind: 'nuxt-content' });
    expect(blindSpotLines(findBlindSpots(run)).at(-1)).toBe(CONTENT_LINE);
  });

  it('gives no line and no banner without Nuxt Content', async () => {
    const run = result();
    expect(blindSpotLines(findBlindSpots(run))).not.toContain(CONTENT_LINE);
    expect((await unusedView(run)).possiblyUsed).toBe(false);
  });
});
