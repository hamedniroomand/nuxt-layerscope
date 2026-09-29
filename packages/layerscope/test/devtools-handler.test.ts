import { createApp, toWebHandler } from 'h3';
import { describe, expect, it, vi } from 'vite-plus/test';

import { Analyzer } from '#src/devtools/analyzer.ts';
import { createDevtoolsHandler } from '#src/devtools/handler.ts';
import { DEVTOOLS_ROUTE } from '#src/devtools/index.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { makeResult } from '#test/factories.ts';

type Run = (options: unknown) => Promise<AnalyzeResult>;

interface Server {
  run: Run;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
}

function server(run: Run = vi.fn<Run>().mockResolvedValue(makeResult())): Server {
  const analyzer = new Analyzer({
    rootDir: '/app',
    baseline: 'b.json',
    envKey: (): string => 'k',
    run,
  });
  const app = createApp();
  app.use(
    DEVTOOLS_ROUTE,
    createDevtoolsHandler({ analyzer, openInEditor: '/_nuxt/__open-in-editor' }),
  );
  const handle = toWebHandler(app);
  return {
    run,
    fetch: async (path, init) => {
      const response = await handle(new Request(`http://localhost${DEVTOOLS_ROUTE}${path}`, init));
      return response;
    },
  };
}

describe('devtools handler pages', () => {
  it('serves the page and re-analyzes on every load', async () => {
    const { fetch, run } = server();
    await fetch('/');
    const response = await fetch('/');
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('keeps ?format=json returning the check report', async () => {
    const { fetch } = server();
    const body: unknown = await (await fetch('/?format=json')).json();
    expect(body).toHaveProperty('findings');
  });
});

describe('devtools handler api', () => {
  it('serves state and report with a revision etag', async () => {
    const { fetch } = server();
    const state = await fetch('/api/state');
    expect(await state.json()).toMatchObject({ rev: 0, status: 'ready' });
    const report = await fetch('/api/report');
    expect(report.headers.get('etag')).toMatch(/^"[\w-]+-0"$/u);
    expect(report.headers.get('cache-control')).toBe('no-cache');
    expect(await report.json()).toHaveProperty('report.findings');
  });

  it('answers 304 when the etag matches', async () => {
    const { fetch } = server();
    const etag = (await fetch('/api/report')).headers.get('etag') ?? '';
    const response = await fetch('/api/report', { headers: { 'if-none-match': etag } });
    expect(response.status).toBe(304);
    expect(await response.text()).toBe('');
  });

  it('only re-runs on POST', async () => {
    const { fetch, run } = server();
    expect((await fetch('/api/rerun')).status).toBe(405);
    expect(run).not.toHaveBeenCalled();
    await fetch('/api/rerun', { method: 'POST' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('shares one run between concurrent api calls', async () => {
    const { fetch, run } = server();
    await Promise.all([fetch('/api/report'), fetch('/api/state')]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('returns a json error and retries after a failure', async () => {
    const run = vi
      .fn<Run>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(makeResult());
    const { fetch } = server(run);
    const failed = await fetch('/api/report');
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: 'boom' });
    expect((await fetch('/api/report')).status).toBe(200);
  });

  it('answers 404 for unknown paths', async () => {
    const { fetch } = server();
    expect((await fetch('/api/nope')).status).toBe(404);
  });
});
