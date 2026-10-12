import { join } from 'pathe';
import { describe, expect, it, vi } from 'vite-plus/test';

import type { AnalyzeOptions } from '#src/analyze/index.ts';
import { Analyzer } from '#src/devtools/analyzer.ts';
import { sessionOptions } from '#src/devtools/index.ts';
import { unusedView } from '#src/devtools/views-api.ts';
import type { AnalyzeResult } from '#src/types.ts';

import { writeProject } from './unused-extra-project.ts';

describe('the DevTools session', () => {
  it('reads the extra files, so the Unused view counts nuxt.config.ts', async () => {
    const root = writeProject(
      {
        'layers/web/shared/utils/locales.ts': 'export const LOCALES = [];\n',
        'layers/web/nuxt.config.ts':
          "import { LOCALES } from './shared/utils/locales';\nexport default { LOCALES };\n",
      },
      { LOCALES: 'layers/web/shared/utils/locales.ts' },
    );
    const analyzer = new Analyzer(sessionOptions(root, join(root, '.nuxt')));
    const view = await unusedView((await analyzer.get()).result);
    expect(view.unused.map(row => row.name)).toEqual([]);
  });
});

describe('the analyzer option extraFiles', () => {
  async function optionsOf(extraFiles?: boolean): Promise<AnalyzeOptions> {
    const run = vi.fn<(options: AnalyzeOptions) => Promise<AnalyzeResult>>();
    run.mockRejectedValue(new Error('stop'));
    const analyzer = new Analyzer({
      rootDir: '/app',
      baseline: 'b.json',
      envKey: (): string => 'k',
      run,
      ...(extraFiles === undefined ? {} : { extraFiles }),
    });
    await analyzer.refresh().catch(() => null);
    return run.mock.calls[0][0];
  }

  it('is passed to the run only when the server sets it', async () => {
    expect((await optionsOf()).extraFiles).toBeUndefined();
    expect((await optionsOf(true)).extraFiles).toBe(true);
  });
});
