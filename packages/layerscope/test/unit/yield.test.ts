import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it, vi } from 'vite-plus/test';

import { AnalysisCache, analyzeFiles } from '#src/analyze/cache.ts';
import type { AnalysisEnv, FileAnalysis } from '#src/analyze/file-analysis.ts';
import { createYielder } from '#src/utils/yield.ts';
import { makeLayer } from '#test/factories.ts';

describe('createYielder', () => {
  it('yields after a batch of calls', async () => {
    const turn = vi.fn<() => Promise<void>>().mockResolvedValue();
    const pause = createYielder({ files: 25, ms: 1000, now: () => 0, turn });
    for (let call = 0; call < 60; call += 1) {
      // eslint-disable-next-line no-await-in-loop -- the calls must run in order
      await pause();
    }
    expect(turn).toHaveBeenCalledTimes(2);
  });

  it('yields once the batch has taken too long', async () => {
    const turn = vi.fn<() => Promise<void>>().mockResolvedValue();
    let time = 0;
    const pause = createYielder({ files: 25, ms: 8, now: () => time, turn });
    await pause();
    time = 9;
    await pause();
    expect(turn).toHaveBeenCalledOnce();
    await pause();
    expect(turn).toHaveBeenCalledOnce();
  });

  it('gives the event loop a real turn, not a microtask', async () => {
    const order: string[] = [];
    // A microtask yield would resume before this callback; a loop turn runs it first.
    setImmediate(() => {
      order.push('queued');
    });
    const pause = createYielder({ files: 1 });
    await pause();
    order.push('after');
    expect(order).toEqual(['queued', 'after']);
  });
});

describe('analyzeFiles', () => {
  it('calls the pause after every file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'layerscope-yield-'));
    const files = new Map(
      ['a.ts', 'b.ts', 'c.ts'].map(name => {
        const file = join(dir, name);
        writeFileSync(file, 'export const x = 1;\n');
        return [file, makeLayer('web', dir)];
      }),
    );
    // Cached analyses, so the test counts pauses without parsing anything.
    const cache = new AnalysisCache();
    cache.reset(`k\0${[...files.keys()].toSorted().join('\0')}`);
    for (const file of files.keys()) {
      cache.get(file, () => ({ file }) as FileAnalysis);
    }
    const pause = vi.fn<() => Promise<void>>().mockResolvedValue();
    const analyses = await analyzeFiles(files, {} as AnalysisEnv, cache, 'k', pause);
    expect(analyses).toHaveLength(3);
    expect(pause).toHaveBeenCalledTimes(3);
  });
});
