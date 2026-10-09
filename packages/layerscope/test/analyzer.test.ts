import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it, vi } from 'vite-plus/test';

import { applyBaselineFile, createBaseline, writeBaseline } from '#src/baseline/index.ts';
import { Analyzer } from '#src/devtools/analyzer.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { makeFinding, makeResult } from '#test/factories.ts';

type Run = (options: unknown) => Promise<AnalyzeResult>;

function setup(run: Run = vi.fn<Run>().mockResolvedValue(makeResult())): {
  analyzer: Analyzer;
  run: Run;
} {
  const analyzer = new Analyzer({
    rootDir: '/app',
    baseline: 'b.json',
    envKey: (): string => 'k',
    run,
  });
  return { analyzer, run };
}

describe('Analyzer', () => {
  it('runs once for concurrent requests', async () => {
    const { analyzer, run } = setup();
    const [one, two] = await Promise.all([analyzer.get(), analyzer.get()]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(one).toBe(two);
  });

  it('serves the cached snapshot until invalidated', async () => {
    const { analyzer, run } = setup();
    await analyzer.get();
    await analyzer.get();
    expect(run).toHaveBeenCalledTimes(1);
    analyzer.invalidate();
    await analyzer.get();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('passes the baseline file, a cache and the env key to analyze', async () => {
    const { analyzer, run } = setup();
    await analyzer.get();
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ rootDir: '/app', baseline: 'b.json', envKey: 'k' }),
    );
  });
});

describe('Analyzer revisions', () => {
  it('bumps the revision only when the output changes', async () => {
    const run = vi
      .fn<Run>()
      .mockResolvedValueOnce(makeResult())
      .mockResolvedValueOnce(makeResult())
      .mockResolvedValueOnce(makeResult({ findings: [makeFinding()] }));
    const { analyzer } = setup(run);
    const first = await analyzer.get();
    const same = await analyzer.refresh();
    const changed = await analyzer.refresh();
    expect(same.rev).toBe(first.rev);
    expect(changed.rev).toBe(first.rev + 1);
  });

  it('bumps the revision when only the layer config changes', async () => {
    const run = vi
      .fn<Run>()
      .mockResolvedValueOnce(makeResult({ config: { layers: { web: { allow: [] } } } }))
      .mockResolvedValueOnce(makeResult({ config: { layers: { web: { allow: ['shop'] } } } }));
    const { analyzer } = setup(run);
    const first = await analyzer.get();
    const changed = await analyzer.refresh();
    expect(changed.rev).toBe(first.rev + 1);
  });

  it('bumps the revision when only typeImports changes', async () => {
    const run = vi
      .fn<Run>()
      .mockResolvedValueOnce(makeResult({ config: { typeImports: 'check' } }))
      .mockResolvedValueOnce(makeResult({ config: { typeImports: 'ignore' } }));
    const { analyzer } = setup(run);
    const first = await analyzer.get();
    const changed = await analyzer.refresh();
    expect(changed.rev).toBe(first.rev + 1);
  });

  it('does not cache a failure', async () => {
    const run = vi
      .fn<Run>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(makeResult());
    const { analyzer } = setup(run);
    await expect(analyzer.get()).rejects.toThrow('boom');
    await expect(analyzer.get()).resolves.toBeDefined();
  });
});

describe('Analyzer concurrency', () => {
  it('re-analyzes for a refresh requested while a run is in flight', async () => {
    const gate = Promise.withResolvers<null>();
    const run = vi
      .fn<Run>()
      .mockImplementationOnce(async () => {
        await gate.promise;
        return makeResult();
      })
      .mockResolvedValueOnce(makeResult({ findings: [makeFinding()] }));
    const { analyzer } = setup(run);
    const first = analyzer.get();
    const refreshed = analyzer.refresh();
    gate.resolve(null);
    await first;
    const snapshot = await refreshed;
    expect(run).toHaveBeenCalledTimes(2);
    expect(snapshot.result.findings).toHaveLength(1);
  });

  it('tells subscribers about each snapshot and ignores a failing one', async () => {
    const { analyzer } = setup();
    const seen: number[] = [];
    analyzer.subscribe(() => {
      throw new Error('listener bug');
    });
    const leave = analyzer.subscribe(snapshot => {
      seen.push(snapshot.rev);
    });
    await expect(analyzer.refresh()).resolves.toBeDefined();
    leave();
    await analyzer.refresh();
    expect(seen).toEqual([0]);
  });

  it('gives each analyzer its own snapshot id', async () => {
    const one = await setup().analyzer.get();
    const two = await setup().analyzer.get();
    expect(one.id).not.toBe(two.id);
  });
});

describe('Analyzer rebaseline', () => {
  it('applies a changed baseline file to the last result without analyzing again', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'layerscope-rebaseline-'));
    const findings = [makeFinding(), makeFinding({ symbol: 'useTotal', line: 9 })];
    const run = vi.fn<Run>().mockResolvedValue(makeResult({ findings }));
    const analyzer = new Analyzer({ rootDir, baseline: 'b.json', envKey: (): string => 'k', run });
    const first = await analyzer.get();
    const file = join(rootDir, 'b.json');
    writeBaseline(file, createBaseline([findings[0] ?? makeFinding()], '/app'));
    const next = await analyzer.rebaseline();
    expect(run).toHaveBeenCalledOnce();
    expect(next.cause).toBe('baseline');
    expect(next.rev).toBe(first.rev + 1);
    const fresh = applyBaselineFile(makeResult({ findings }), file);
    expect(next.result.findings).toEqual(fresh.findings);
    expect(next.result.baseline?.suppressed).toEqual(fresh.baseline?.suppressed);
  });
});

describe('Analyzer rebaseline while analyzing', () => {
  it('waits for the run in flight and applies the baseline to its result', async () => {
    const gate = Promise.withResolvers<null>();
    const run = vi.fn<Run>().mockImplementation(async () => {
      await gate.promise;
      return makeResult({ findings: [makeFinding()] });
    });
    const analyzer = new Analyzer({
      rootDir: '/nowhere',
      baseline: 'b.json',
      envKey: (): string => 'k',
      run,
    });
    const analyzing = analyzer.get();
    const rebaselined = analyzer.rebaseline();
    gate.resolve(null);
    const first = await analyzing;
    const next = await rebaselined;
    expect(run).toHaveBeenCalledOnce();
    expect(next.cause).toBe('baseline');
    expect(next.result.findings).toEqual(first.result.findings);
  });
});
