import { writeFileSync } from 'node:fs';

import { join } from 'pathe';
import { describe, expect, it, vi } from 'vite-plus/test';

import type { AnalyzeOptions } from '#src/analyze/index.ts';
import { Analyzer } from '#src/devtools/analyzer.ts';
import { sessionOptions } from '#src/devtools/index.ts';
import { unusedView } from '#src/devtools/views-api.ts';
import type { AnalyzeResult } from '#src/types.ts';

import { LIB, LIB_IMPORTS, writeProject } from './unused-extra-project.ts';

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

describe('the DevTools revision', () => {
  it('changes when only an extra file changes', async () => {
    const root = writeProject(LIB, LIB_IMPORTS);
    const analyzer = new Analyzer(sessionOptions(root, join(root, '.nuxt')));
    const before = await analyzer.get();
    writeFileSync(join(root, 'layers/web/lib/libA.ts'), 'export const libA = () => 1;\n');
    const after = await analyzer.refresh();
    expect(after.rev).toBe(before.rev + 1);
  });
});

describe('the DevTools revision and the Unused view', () => {
  const imports = {
    x: 'layers/web/app/utils/x.ts',
    y: 'layers/web/app/utils/y.ts',
  };
  const page = (call: string): string =>
    `<script setup lang="ts">\n${call}();\n</script>\n<template><div /></template>\n`;

  it('changes when a use in the same layer changes', async () => {
    const root = writeProject(
      {
        'layers/web/app/utils/x.ts': 'export const x = () => 1;\n',
        'layers/web/app/utils/y.ts': 'export const y = () => 1;\n',
        'layers/web/app/pages/index.vue': page('x'),
      },
      imports,
    );
    const analyzer = new Analyzer(sessionOptions(root, join(root, '.nuxt')));
    const before = await analyzer.get();
    writeFileSync(join(root, 'layers/web/app/pages/index.vue'), page('y'));
    const after = await analyzer.refresh();
    expect(after.rev).toBe(before.rev + 1);
  });

  it('changes when only the list of unread files changes', async () => {
    const root = writeProject(LIB, LIB_IMPORTS);
    const analyzer = new Analyzer(sessionOptions(root, join(root, '.nuxt')));
    const before = await analyzer.get();
    // libB has no use of another symbol, so its edges stay the same.
    writeFileSync(join(root, 'layers/web/lib/libB.ts'), 'export const libB = = ;\n');
    const after = await analyzer.refresh();
    expect(after.result.unreadFiles).toHaveLength(1);
    expect(after.rev).toBe(before.rev + 1);
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
