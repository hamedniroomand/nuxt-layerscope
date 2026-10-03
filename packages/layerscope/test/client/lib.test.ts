import { describe, expect, it, vi } from 'vite-plus/test';

import { ApiError, createApi } from '#src/devtools/client/lib/api.ts';
import {
  countBy,
  filterFindings,
  groupFindings,
  toggle,
} from '#src/devtools/client/lib/filters.ts';
import { clock, duration, location, plural } from '#src/devtools/client/lib/format.ts';
import { emptyQuery, formatHash, parseHash } from '#src/devtools/client/lib/router.ts';
import { createShortcuts } from '#src/devtools/client/lib/shortcuts.ts';
import { createStore } from '#src/devtools/client/lib/store.ts';
import { reportResponse, sampleFindings } from '#test/client/fixtures.ts';

describe('router', () => {
  it('parses and formats the findings query', () => {
    const hash =
      '#/findings?sev=error&rule=layer-boundary&pair=admin%3Ashop&q=cart&group=file&new=1';
    const route = parseHash(hash);
    expect(route).toEqual({
      view: 'findings',
      query: {
        sev: ['error'],
        rule: ['layer-boundary'],
        pair: 'admin:shop',
        file: null,
        q: 'cart',
        group: 'file',
        onlyNew: true,
      },
    });
    expect(parseHash(formatHash(route))).toEqual(route);
  });

  it('falls back to defaults for unknown views and groups', () => {
    expect(parseHash('#/nope?group=size')).toEqual({ view: 'overview', query: emptyQuery() });
    expect(parseHash('')).toEqual({ view: 'overview', query: emptyQuery() });
  });

  it('leaves defaults out of the hash', () => {
    expect(formatHash({ view: 'graph', query: emptyQuery() })).toBe('#/graph');
  });
});

describe('filters', () => {
  const findings = sampleFindings();

  it('filters by severity, rule, pair, file and text', () => {
    const query = emptyQuery();
    expect(filterFindings(findings, { ...query, sev: ['warn'] })).toHaveLength(1);
    expect(filterFindings(findings, { ...query, rule: ['layer-boundary'] })).toHaveLength(2);
    expect(filterFindings(findings, { ...query, pair: 'admin:shop' })).toHaveLength(1);
    expect(filterFindings(findings, { ...query, file: 'layers/ui/Button.vue' })).toHaveLength(1);
    expect(filterFindings(findings, { ...query, q: ' CART ' })).toHaveLength(2);
  });

  it('groups with errors first and keeps report order inside a group', () => {
    const byRule = groupFindings(findings.toReversed(), 'rule');
    expect(byRule.map(group => [group.key, group.severity, group.findings.length])).toEqual([
      ['layer-boundary', 'error', 2],
      ['shadowed-component', 'warn', 1],
    ]);
    expect(groupFindings(findings, 'pair').map(group => group.label)).toEqual([
      'web → shop',
      'admin → shop',
      'no target layer',
    ]);
    expect(groupFindings(findings, 'none')).toHaveLength(1);
    expect(groupFindings(findings, 'file')).toHaveLength(3);
  });

  it('counts chips and toggles values', () => {
    expect(countBy(findings, finding => finding.severity)).toEqual([
      { value: 'error', count: 2 },
      { value: 'warn', count: 1 },
    ]);
    expect(toggle(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggle(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('format', () => {
  it('formats counts, times and locations', () => {
    expect(plural(1, 'error')).toBe('1 error');
    expect(plural(2, 'error')).toBe('2 errors');
    expect(clock(new Date(2026, 0, 1, 4, 5, 6).getTime())).toBe('04:05:06');
    expect(duration(38.4)).toBe('38 ms');
    expect(duration(1500)).toBe('1.5 s');
    expect(location('a.vue', 3, 7)).toBe('a.vue:3:7');
  });
});

describe('shortcuts', () => {
  const key = (
    value: string,
    target: unknown = null,
  ): Parameters<ReturnType<typeof createShortcuts>['handle']>[0] => ({
    key: value,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: target as EventTarget | null,
  });

  it('runs the latest registration and ignores keys typed into fields', () => {
    const shortcuts = createShortcuts();
    const first = vi.fn();
    const second = vi.fn();
    shortcuts.register({ key: 'j', label: 'a', run: first });
    const remove = shortcuts.register({ key: 'j', label: 'b', run: second });
    expect(shortcuts.handle(key('j'))).toBe(true);
    expect(second).toHaveBeenCalledOnce();
    remove();
    shortcuts.handle(key('j'));
    expect(first).toHaveBeenCalledOnce();
    expect(shortcuts.handle(key('j', { tagName: 'INPUT' }))).toBe(false);
    expect(shortcuts.handle({ ...key('j'), metaKey: true })).toBe(false);
    expect(shortcuts.handle(key('x'))).toBe(false);
  });

  it('lets Escape through in fields when asked', () => {
    const shortcuts = createShortcuts();
    const run = vi.fn();
    shortcuts.register({ key: 'Escape', label: 'Clear', run, inFields: true });
    expect(shortcuts.handle(key('Escape', { tagName: 'TEXTAREA' }))).toBe(true);
    expect(shortcuts.list()).toHaveLength(1);
  });
});

function response(status: number, body: unknown, etag?: string): Response {
  const headers = new Headers(etag === undefined ? {} : { etag });
  return new Response(status === 304 ? null : JSON.stringify(body), { status, headers });
}

describe('api and store', () => {
  const config = { base: '/__layerscope', openInEditor: '/_nuxt/__open-in-editor', token: 't' };

  it('loads the report, revalidates with the etag and keeps data on 304', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(200, reportResponse(), '"a-0"'))
      .mockResolvedValueOnce(response(304, null));
    const store = createStore(createApi(config, request));
    await store.load();
    await store.load();
    expect(request.mock.calls[1]?.[1]).toEqual({ headers: { 'if-none-match': '"a-0"' } });
    expect(store.state.data?.rev).toBe(0);
  });

  it('separates analysis errors from an unreachable server', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(500, { error: 'boom' }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const store = createStore(createApi(config, request));
    await store.load();
    expect(store.state.error).toBe('boom');
    await store.load();
    expect(store.state.unreachable).toBe(true);
  });

  it('re-runs with POST and asks for the whole report next time', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(200, reportResponse({}, 3)));
    const store = createStore(createApi(config, request));
    await store.rerun();
    expect(request).toHaveBeenCalledWith('/__layerscope/api/rerun', { method: 'POST' });
    expect(store.state.data?.rev).toBe(3);
    expect(store.state.etag).toBeNull();
    expect(store.state.running).toBe(false);
  });
});

describe('store and live mode', () => {
  const config = { base: '/__layerscope', openInEditor: '/_nuxt/__open-in-editor', token: 't' };

  it('takes the timing from a live event and fetches only a changed report', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(200, reportResponse(), '"a-0-0-0"'))
      .mockResolvedValueOnce(response(200, reportResponse({}, 1), '"a-1-0-0"'));
    const store = createStore(createApi(config, request));
    await store.load();
    const event = { id: 'a', rev: 0, marker: 0, analyzedAt: 99, durationMs: 4 };
    await store.applyEvent(event);
    expect(request).toHaveBeenCalledOnce();
    expect(store.state.data).toMatchObject({ analyzedAt: 99, durationMs: 4 });
    await store.applyEvent({ ...event, rev: 1 });
    expect(request).toHaveBeenCalledTimes(2);
    expect(store.state.data?.rev).toBe(1);
  });

  it('steers live mode and reads the state', async () => {
    const live = { clients: 1, paused: true };
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(200, { live }))
      .mockResolvedValueOnce(response(200, { live }));
    const api = createApi(config, request);
    expect(await api.live('pause')).toEqual({ live });
    expect(request).toHaveBeenLastCalledWith('/__layerscope/api/live/pause', { method: 'POST' });
    await api.state();
    expect(request.mock.lastCall?.[0]).toBe('/__layerscope/api/state');
    expect(api.events).toBe('/__layerscope/events');
  });

  it('reports a failed re-run and opens files in the editor', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(409, {}));
    const api = createApi(config, request);
    await expect(api.rerun()).rejects.toBeInstanceOf(ApiError);
    await api.openInEditor('/app/a b.vue', 3, 4);
    expect(request).toHaveBeenLastCalledWith(
      '/_nuxt/__open-in-editor?file=%2Fapp%2Fa%20b.vue%3A3%3A4',
    );
  });
});
