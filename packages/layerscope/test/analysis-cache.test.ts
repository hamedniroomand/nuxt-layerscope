import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { AnalysisCache } from '#src/analyze/cache.ts';
import type { FileAnalysis } from '#src/analyze/file-analysis.ts';

function tmpFile(content: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'layerscope-cache-')), 'a.ts');
  writeFileSync(file, content);
  return file;
}

const fake = (): FileAnalysis => ({}) as FileAnalysis;

describe('AnalysisCache', () => {
  it('returns the cached analysis while the file is unchanged', () => {
    const cache = new AnalysisCache();
    const file = tmpFile('a');
    const first = cache.get(file, fake);
    expect(cache.get(file, fake)).toBe(first);
  });

  it('recomputes when mtime or size changes', () => {
    const cache = new AnalysisCache();
    const file = tmpFile('a');
    const first = cache.get(file, fake);
    writeFileSync(file, 'longer');
    utimesSync(file, new Date(), new Date(Date.now() + 5000));
    expect(cache.get(file, fake)).not.toBe(first);
  });

  it('flushes everything when the env key changes', () => {
    const cache = new AnalysisCache();
    cache.reset('one');
    const file = tmpFile('a');
    const first = cache.get(file, fake);
    cache.reset('one');
    expect(cache.get(file, fake)).toBe(first);
    cache.reset('two');
    expect(cache.size).toBe(0);
  });

  it('drops files that are no longer analyzed', () => {
    const cache = new AnalysisCache();
    const keep = tmpFile('a');
    const gone = tmpFile('b');
    cache.get(keep, fake);
    cache.get(gone, fake);
    cache.retain([keep]);
    expect(cache.size).toBe(1);
  });
});
