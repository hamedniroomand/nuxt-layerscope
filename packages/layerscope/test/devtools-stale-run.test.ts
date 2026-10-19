import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it, vi } from 'vite-plus/test';

import { Analyzer } from '#src/devtools/analyzer.ts';
import { findingKey } from '#src/devtools/finding-keys.ts';
import type { AnalyzeResult, BaselineEntry } from '#src/types.ts';
import type { Server } from '#test/devtools-server.ts';
import { server } from '#test/devtools-server.ts';
import { makeFinding, makeResult } from '#test/factories.ts';

type Run = (options: unknown) => Promise<AnalyzeResult>;

const cart = makeFinding();
const total = makeFinding({ symbol: 'useTotal' });

/** A result whose config names the baseline file `name` in `root`, as a real run gives it. */
const withFile = (root: string, name: string): AnalyzeResult =>
  makeResult({
    findings: [cart],
    config: { baseline: name },
    baseline: { file: join(root, name), suppressed: [], removable: [] },
  });

async function ignoreCart(app: Server, state: { id: string; rev: number }): Promise<Response> {
  const response = await app.fetch('/api/baseline/ignore', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-layerscope-token': app.session.token },
    body: JSON.stringify({ ...state, keys: [findingKey(cart, '/app')] }),
  });
  return response;
}

describe('the revision of the DevTools analyzer', () => {
  it('goes up when only the fixed baseline entries change', async () => {
    const entry: BaselineEntry = {
      rule: cart.rule,
      file: 'pages/a.vue',
      symbol: 'useGone',
      toLayer: 'shop',
    };
    const withRemovable = (removable: BaselineEntry[]): AnalyzeResult =>
      makeResult({ baseline: { file: '/app/b.json', suppressed: [], removable } });
    const run = vi
      .fn<Run>()
      .mockResolvedValueOnce(withRemovable([]))
      .mockResolvedValueOnce(withRemovable([entry]));
    const analyzer = new Analyzer({ rootDir: '/app', envKey: (): string => 'k', run });
    const first = await analyzer.get();
    const next = await analyzer.refresh();
    expect(next.rev).toBe(first.rev + 1);
  });
});

describe('rebaseline after a change', () => {
  it('runs a full analysis when a file changed after the last run', async () => {
    const run = vi.fn<Run>().mockResolvedValue(makeResult({ findings: [cart] }));
    const analyzer = new Analyzer({
      rootDir: mkdtempSync(join(tmpdir(), 'layerscope-stale-')),
      baseline: 'b.json',
      envKey: (): string => 'k',
      run,
    });
    await analyzer.get();
    analyzer.invalidate();
    const next = await analyzer.rebaseline();
    expect(run).toHaveBeenCalledTimes(2);
    // The tab shows no change toast for the run after its own write.
    expect(next.cause).toBe('baseline');
  });
});

describe('a DevTools GET after a config edit', () => {
  it('answers a GET with a run of the new config, also while an older run is in flight', async () => {
    let key = 'k1';
    const gate = Promise.withResolvers<null>();
    // The GET reads the new key first. The old run ends only after that, on a timer, so the GET
    // finds it still in flight.
    const envKey = (): string => {
      if (key === 'k2') {
        setTimeout(() => {
          gate.resolve(null);
        }, 0);
      }
      return key;
    };
    const app = await server('/app', { envKey });
    await app.fetch('/api/report');
    app.run
      .mockImplementationOnce(async () => {
        await gate.promise;
        return makeResult({ findings: [cart] });
      })
      .mockResolvedValueOnce(makeResult({ findings: [total] }));
    app.session.analyzer.invalidate();
    const old = app.session.analyzer.get();
    key = 'k2';
    const body = (await (await app.fetch('/api/report')).json()) as {
      report: { findings: { symbol: string }[] };
    };
    await old;
    expect(body.report.findings.map(finding => finding.symbol)).toEqual(['useTotal']);
  });
});

describe('a DevTools undo after a config edit', () => {
  it('runs a full analysis after an undo when the config changed', async () => {
    let key = 'k1';
    const root = mkdtempSync(join(tmpdir(), 'layerscope-stale-'));
    const app = await server(root, { envKey: (): string => key });
    app.run.mockResolvedValue(makeResult({ findings: [cart, total] }));
    const post = async (path: string, body: object): Promise<Response> => {
      const response = await app.fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-layerscope-token': app.session.token },
        body: JSON.stringify(body),
      });
      return response;
    };
    const state = (await (await app.fetch('/api/state')).json()) as { id: string; rev: number };
    const written = (await (
      await post('/api/baseline/ignore', { ...state, keys: [findingKey(cart, '/app')] })
    ).json()) as { id: string; writeId: number };
    const runs = app.run.mock.calls.length;
    key = 'k2';
    const undone = await post('/api/baseline/undo', { id: written.id, writeId: written.writeId });
    expect(undone.status).toBe(200);
    expect(app.run).toHaveBeenCalledTimes(runs + 1);
  });
});

describe('a DevTools ignore while a run of a new config is in flight', () => {
  it('refuses with 409, and writes nothing to the baseline file of the old config', async () => {
    const root = mkdtempSync(join(tmpdir(), 'layerscope-stale-'));
    let key = 'k1';
    let keyCalls = 0;
    const gate = Promise.withResolvers<null>();
    // The run of the new config reads the key first. The old run ends only after the request
    // reads it too, on a timer, so the request finds the run still in flight.
    const envKey = (): string => {
      if (key === 'k2' && (keyCalls += 1) === 2) {
        setTimeout(() => {
          gate.resolve(null);
        }, 0);
      }
      return key;
    };
    const app = await server(root, { baseline: undefined, envKey });
    app.run.mockResolvedValueOnce(withFile(root, 'one.json'));
    const state = (await (await app.fetch('/api/state')).json()) as { id: string; rev: number };
    app.run.mockImplementationOnce(async () => {
      await gate.promise;
      return withFile(root, 'two.json');
    });
    key = 'k2';
    app.session.analyzer.invalidate();
    const running = app.session.analyzer.get();
    const response = await ignoreCart(app, state);
    await running;
    expect(response.status).toBe(409);
    expect(existsSync(join(root, 'one.json'))).toBe(false);
    expect(existsSync(join(root, 'two.json'))).toBe(false);
  });
});

describe('a DevTools ignore that waits for a run when a newer config comes', () => {
  it('refuses with 409 when a run of the new config is queued behind that run', async () => {
    const root = mkdtempSync(join(tmpdir(), 'layerscope-stale-'));
    let key = 'k1';
    // Counts the key reads after the first run. Read 1: the run of the old config starts. Read 2:
    // the request, while that run is in flight. Then the config changes, a run of it queues, and
    // the old run ends.
    let reads = -1;
    let queued: Promise<unknown> | undefined;
    const gate = Promise.withResolvers<null>();
    const app = await server(root, {
      baseline: undefined,
      envKey: (): string => {
        const now = key;
        if (reads >= 0 && (reads += 1) === 2) {
          setTimeout(() => {
            key = 'k2';
            queued = app.session.analyzer.refresh();
            gate.resolve(null);
          }, 0);
        }
        return now;
      },
    });
    app.run.mockResolvedValueOnce(withFile(root, 'one.json'));
    const state = (await (await app.fetch('/api/state')).json()) as { id: string; rev: number };
    reads = 0;
    app.run
      .mockImplementationOnce(async () => {
        await gate.promise;
        return withFile(root, 'one.json');
      })
      .mockResolvedValueOnce(withFile(root, 'two.json'));
    app.session.analyzer.invalidate();
    const running = app.session.analyzer.get();
    // A file changes during that run, so the request waits for the run.
    app.session.analyzer.invalidate();
    const response = await ignoreCart(app, state);
    await Promise.all([running, queued]);
    expect(response.status).toBe(409);
    expect(existsSync(join(root, 'one.json'))).toBe(false);
  });
});

describe('a DevTools write when the run after it fails', () => {
  it('answers 200 with the write id, so the write can be undone', async () => {
    const root = mkdtempSync(join(tmpdir(), 'layerscope-stale-'));
    const app = await server(root);
    app.run.mockResolvedValue(makeResult({ findings: [cart, total] }));
    const state = (await (await app.fetch('/api/state')).json()) as { id: string; rev: number };
    const rebaseline = vi.spyOn(app.session.analyzer, 'rebaseline');
    rebaseline.mockRejectedValueOnce(new Error('boom'));
    const written = await ignoreCart(app, state);
    expect(written.status).toBe(200);
    const body = (await written.json()) as { id: string; writeId: number };
    expect(body.writeId).toBe(1);
    expect(existsSync(join(root, 'b.json'))).toBe(true);

    rebaseline.mockRejectedValueOnce(new Error('boom'));
    const undone = await app.fetch('/api/baseline/undo', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-layerscope-token': app.session.token },
      body: JSON.stringify({ id: body.id, writeId: body.writeId }),
    });
    expect(undone.status).toBe(200);
    expect(existsSync(join(root, 'b.json'))).toBe(false);
  });
});
