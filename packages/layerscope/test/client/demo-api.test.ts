import { describe, expect, it, vi } from 'vite-plus/test';

import { NOT_IN_SNAPSHOT, createDemoApi } from '#src/devtools/client/lib/demo-api.ts';

const config = { base: '/docs/__layerscope', openInEditor: '', token: '', demo: true };

/** Serves `files` by URL; every other URL is a 404, as on a static host. */
function host(files: Record<string, unknown>): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async input => {
    const url = input instanceof Request ? input.url : input.toString();
    const body = files[url];
    const response = await Promise.resolve(
      body === undefined
        ? new Response('not found', { status: 404 })
        : new Response(JSON.stringify(body), { status: 200 }),
    );
    return response;
  });
}

describe('demo api reads', () => {
  it('maps each read to its file under the base', async () => {
    const request = host({});
    const api = createDemoApi(config, request);
    await api.symbols();
    await api.trace('useCart');
    await api.trace('$fetch');
    await api.edge('admin', 'web');
    await api.node('admin', 200).catch(() => null);
    await api.graph(true).catch(() => null);
    expect(
      request.mock.calls.map(([url]) => (url instanceof Request ? url.url : url.toString())),
    ).toEqual([
      '/docs/__layerscope/api/symbols.json',
      '/docs/__layerscope/api/trace/useCart.json',
      '/docs/__layerscope/api/trace/%2524fetch.json',
      '/docs/__layerscope/api/edge/admin/web.json',
      '/docs/__layerscope/api/node/admin.json',
      '/docs/__layerscope/api/graph.json',
    ]);
  });

  it('reads a missing file as an empty answer, or as an error where none fits', async () => {
    const api = createDemoApi(config, host({}));
    expect(await api.symbols()).toEqual({ symbols: [] });
    expect(await api.trace('x')).toEqual({ version: 1, symbol: 'x', targets: [] });
    expect(await api.edge('a', 'b')).toMatchObject({ total: 0, symbols: [] });
    await expect(api.node('a')).rejects.toMatchObject({ status: 404 });
  });

  it('reads the report without an etag, and re-run reads it again', async () => {
    const report = { id: 'snapshot', rev: 0, report: { findings: [] } };
    const api = createDemoApi(config, host({ '/docs/__layerscope/api/report.json': report }));
    expect(await api.report('"old"')).toEqual({ data: report, etag: null });
    expect(await api.rerun()).toEqual(report);
  });
});

describe('demo api writes', () => {
  it('refuses the writes and has no live stream or editor', async () => {
    const request = host({});
    const api = createDemoApi(config, request);
    await expect(api.ignore({ id: 's', rev: 0 }, ['k'])).rejects.toThrow(NOT_IN_SNAPSHOT);
    await expect(api.remove({ id: 's', rev: 0 }, ['k'])).rejects.toThrow(NOT_IN_SNAPSHOT);
    await expect(api.undo('s', 1)).rejects.toThrow(NOT_IN_SNAPSHOT);
    expect(await api.live('pause')).toEqual({ live: { clients: 0, paused: true } });
    await api.openInEditor('/a.vue');
    expect(api.events).toBe('');
    expect(request).not.toHaveBeenCalled();
  });
});
