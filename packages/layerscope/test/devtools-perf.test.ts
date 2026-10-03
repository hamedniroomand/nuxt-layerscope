import { utimesSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { Analyzer } from '#src/devtools/analyzer.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

describe('devtools performance', () => {
  it('re-runs the nuxt4 fixture in under 500 ms after a one-file change', async () => {
    const analyzer = new Analyzer({
      rootDir: NUXT4_ROOT,
      baseline: 'layerscope-baseline.json',
      envKey: (): string => 'k',
    });
    await analyzer.get();
    // A newer mtime with the same content: the file is analyzed again, as after a save.
    const file = join(NUXT4_ROOT, 'layers/web/app/composables/useCart.ts');
    utimesSync(file, new Date(), new Date());
    analyzer.invalidate();
    const started = performance.now();
    await analyzer.get();
    // Generous on purpose: CI machines vary; locally this takes about 4 ms.
    expect(performance.now() - started).toBeLessThan(500);
  }, 60_000);
});
