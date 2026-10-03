import { createApp, toWebHandler } from 'h3';
import { describe, expect, it, vi } from 'vite-plus/test';

import { createDevtoolsHandler } from '#src/devtools/handler.ts';
import { DEVTOOLS_ROUTE } from '#src/devtools/index.ts';
import { createSession } from '#src/devtools/session.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { packageVersion } from '#src/version.ts';
import { fakeAssets } from '#test/devtools-assets.ts';
import { makeFinding, makeResult } from '#test/factories.ts';

type Run = (options: unknown) => Promise<AnalyzeResult>;

interface Server {
  run: Run;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
}

function server(run: Run = vi.fn<Run>().mockResolvedValue(makeResult())): Server {
  const session = createSession({
    rootDir: '/app',
    baseline: 'b.json',
    envKey: (): string => 'k',
    run,
  });
  const app = createApp();
  app.use(
    DEVTOOLS_ROUTE,
    createDevtoolsHandler({
      session,
      openInEditor: '/_nuxt/__open-in-editor',
      assetsDir: fakeAssets(),
    }),
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
  it('serves the client shell without analyzing', async () => {
    const { fetch, run } = server();
    const response = await fetch('/');
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('<template id="config">');
    expect(html).toContain('"openInEditor":"/_nuxt/__open-in-editor"');
    expect(html).toContain('<div id="app">');
    expect(html).toMatch(/client\.js\?v=[\d.]+-\d+"/u);
    expect(run).not.toHaveBeenCalled();
  });

  it('serves the built assets with a version etag', async () => {
    const { fetch } = server();
    const response = await fetch('/assets/client.js');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/javascript');
    expect(response.headers.get('cache-control')).toBe('max-age=31536000, immutable');
    expect(await response.text()).toBe('console.log(1)');
    const etag = response.headers.get('etag') ?? '';
    // The package version plus the build time of client.js, so a rebuild busts the cache.
    expect(etag.startsWith(`"${packageVersion()}-`)).toBe(true);
    expect(etag).toMatch(/^"[\d.]+-\d+"$/u);
    const cached = await fetch('/assets/client.css', { headers: { 'if-none-match': etag } });
    expect(cached.status).toBe(304);
  });

  it('answers 404 for missing assets and for paths outside the assets dir', async () => {
    const { fetch } = server();
    expect((await fetch('/assets/nope.js')).status).toBe(404);
    expect((await fetch('/assets/..%2Fsecret.js')).status).toBe(404);
    expect((await fetch('/assets/../secret.js')).status).toBe(404);
    expect((await fetch('/assets/sub/client.js')).status).toBe(404);
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
    // Revision, marker and pause flag.
    expect(report.headers.get('etag')).toMatch(/^"[\w-]+-0-0-0"$/u);
    expect(report.headers.get('cache-control')).toBe('no-cache');
    expect(await report.json()).toHaveProperty('report.findings');
  });
});

describe('devtools handler report', () => {
  it('adds absolute paths, hot files and layer stats to the report', async () => {
    const finding = makeFinding({ file: '/app/pages/index.vue' });
    const { fetch } = server(vi.fn<Run>().mockResolvedValue(makeResult({ findings: [finding] })));
    const body = (await (await fetch('/api/report')).json()) as {
      report: Record<string, unknown> & { findings: Record<string, unknown>[] };
    };
    expect(body.report.absRoot).toBe('/app');
    expect(body.report.findings[0]).toMatchObject({
      file: 'pages/index.vue',
      absFile: '/app/pages/index.vue',
      absTarget: '/app/layers/shop/composables/useCart.ts',
    });
    expect(body.report.hotFiles).toEqual([
      { file: 'pages/index.vue', absFile: '/app/pages/index.vue', errors: 1, warnings: 0 },
    ]);
    expect(body.report.layerStats).toHaveLength(2);
  });

  it('answers 304 when the etag matches', async () => {
    const { fetch } = server();
    const etag = (await fetch('/api/report')).headers.get('etag') ?? '';
    const response = await fetch('/api/report', { headers: { 'if-none-match': etag } });
    expect(response.status).toBe(304);
    expect(await response.text()).toBe('');
  });
});

describe('devtools handler runs', () => {
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
