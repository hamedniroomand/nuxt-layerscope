import { describe, expect, it, vi } from 'vite-plus/test';

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

  it('gives each analyzer its own snapshot id', async () => {
    const one = await setup().analyzer.get();
    const two = await setup().analyzer.get();
    expect(one.id).not.toBe(two.id);
  });
});
