import { describe, expect, it } from 'vite-plus/test';

import { AnalysisCache } from '#src/analyze/cache.ts';
import { analyze } from '#src/analyze/index.ts';

import { page, project, write } from './watch-project.ts';

const FILES = 20;

describe('analysis of a change', () => {
  it('analyzes only the changed file again', async () => {
    const root = project(FILES);
    const cache = new AnalysisCache();
    await analyze({ rootDir: root, cache, envKey: 'k' });
    expect(cache.misses).toBe(FILES + 1);
    // A longer text, so the size changes even when the mtime does not.
    write(root, 'layers/a/app/pages/p3.vue', `${page('../helper')}<!-- edited -->\n`);
    await analyze({ rootDir: root, cache, envKey: 'k' });
    expect(cache.misses).toBe(FILES + 2);
  });

  it('analyzes every file again when a file is added, as imports may resolve differently', async () => {
    const root = project(FILES);
    const cache = new AnalysisCache();
    await analyze({ rootDir: root, cache, envKey: 'k' });
    write(root, 'layers/a/app/pages/new.vue', page('../helper'));
    await analyze({ rootDir: root, cache, envKey: 'k' });
    expect(cache.misses).toBe(FILES + 1 + FILES + 2);
  });
});
