// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vite-plus/test';

import { ApiError, createApi, readConfig } from '#src/devtools/client/lib/api.ts';

const config = { base: '/b', openInEditor: '/open', token: 't0k' };

type FakeFetch = ReturnType<typeof vi.fn<typeof fetch>>;

const OK = { ok: true };

/** A fetch that records each call and answers with JSON, or with `status` and no body. */
function fakeFetch(status = 200, body: unknown = OK): FakeFetch {
  return vi.fn<typeof fetch>(async () => {
    const response = await Promise.resolve(
      new Response(body === null ? null : JSON.stringify(body), {
        status,
        headers: { etag: '"r1"' },
      }),
    );
    return response;
  });
}

function sent(request: FakeFetch): [string, RequestInit | undefined][] {
  return request.mock.calls.map(([url, init]) => [
    url instanceof Request ? url.url : url.toString(),
    init,
  ]);
}

describe('client api reads', () => {
  it('reads the report with its etag, and null on 304', async () => {
    const request = fakeFetch();
    const api = createApi(config, request);
    expect(await api.report(null)).toEqual({ data: { ok: true }, etag: '"r1"' });
    const notModified = fakeFetch(304, null);
    expect(await createApi(config, notModified).report('"r1"')).toBeNull();
    expect(sent(notModified)[0]?.[1]).toEqual({ headers: { 'if-none-match': '"r1"' } });
  });

  it('calls each view route with its query', async () => {
    const request = fakeFetch();
    const api = createApi(config, request);
    await api.symbols();
    await api.trace('a b');
    await api.unused();
    await api.baseline();
    await api.graph();
    await api.graph(true);
    await api.edge('web', 'shop');
    await api.node('web');
    await api.node('web', 200);
    await api.state();
    expect(sent(request).map(([url]) => url)).toEqual([
      '/b/api/symbols',
      '/b/api/trace?symbol=a%20b',
      '/b/api/unused',
      '/b/api/baseline',
      '/b/api/graph',
      '/b/api/graph?layout=1',
      '/b/api/edge?from=web&to=shop',
      '/b/api/node?layer=web&offset=0',
      '/b/api/node?layer=web&offset=200',
      '/b/api/state',
    ]);
    expect(api.events).toBe('/b/events');
  });
});

describe('client api errors', () => {
  it('throws an ApiError with the server message, or the status without one', async () => {
    const withBody = createApi(config, fakeFetch(409, { error: 'stale' }));
    await expect(withBody.state()).rejects.toEqual(new ApiError(409, 'stale'));
    await expect(withBody.report(null)).rejects.toMatchObject({ status: 409, message: 'stale' });
    const withoutBody = createApi(
      config,
      vi.fn<typeof fetch>(async () => {
        const response = await Promise.resolve(new Response('not json', { status: 500 }));
        return response;
      }),
    );
    await expect(withoutBody.unused()).rejects.toMatchObject({ status: 500, message: 'HTTP 500' });
  });
});

describe('client api writes', () => {
  it('posts the writes as JSON with the token', async () => {
    const request = fakeFetch();
    const api = createApi(config, request);
    await api.ignore({ id: 's', rev: 3 }, ['k1']);
    await api.remove({ id: 's', rev: 3 }, ['k2']);
    await api.undo('s', 7);
    expect(sent(request).map(([url, init]) => [url, init?.body])).toEqual([
      ['/b/api/baseline/ignore', JSON.stringify({ id: 's', rev: 3, keys: ['k1'] })],
      ['/b/api/baseline/remove', JSON.stringify({ id: 's', rev: 3, keys: ['k2'] })],
      ['/b/api/baseline/undo', JSON.stringify({ id: 's', writeId: 7 })],
    ]);
    expect(sent(request)[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-layerscope-token': 't0k' },
    });
  });

  it('posts rerun and the live actions, and opens a file in the editor', async () => {
    const request = fakeFetch();
    const api = createApi(config, request);
    await api.rerun();
    await api.live('pause');
    await api.openInEditor('/app/a.vue');
    await api.openInEditor('/app/b.vue', 4, 2);
    expect(sent(request).map(([url, init]) => [url, init?.method])).toEqual([
      ['/b/api/rerun', 'POST'],
      ['/b/api/live/pause', 'POST'],
      [`/open?file=${encodeURIComponent('/app/a.vue:1:1')}`, undefined],
      [`/open?file=${encodeURIComponent('/app/b.vue:4:2')}`, undefined],
    ]);
  });
});

describe('shell config', () => {
  const page = (json: string | null): Document => {
    const doc = document.implementation.createHTMLDocument();
    if (json !== null) {
      const template = doc.createElement('template');
      template.id = 'config';
      template.content.textContent = json;
      doc.body.append(template);
    }
    return doc;
  };

  it('falls back to the defaults without the template, and fills gaps in partial JSON', () => {
    const defaults = { base: '/__layerscope', openInEditor: '/_nuxt/__open-in-editor', token: '' };
    expect(readConfig(page(null))).toEqual(defaults);
    expect(readConfig(page(''))).toEqual(defaults);
    expect(readConfig(page('{"token":"x"}'))).toEqual({ ...defaults, token: 'x' });
  });
});
