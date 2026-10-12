import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it } from 'vite-plus/test';

import { createBaseline, writeBaseline } from '#src/baseline/index.ts';
import { findingKey } from '#src/devtools/finding-keys.ts';
import type { LiveMessage } from '#src/devtools/live.ts';
import type { Server } from '#test/devtools-server.ts';
import { server } from '#test/devtools-server.ts';
import { makeFinding, makeResult } from '#test/factories.ts';

const cart = makeFinding();
const total = makeFinding({ symbol: 'useTotal' });
const KEY = findingKey(cart, '/app');

interface Setup extends Server {
  file: string;
  post: (path: string, body: object, headers?: Record<string, string>) => Promise<Response>;
  meta: () => Promise<{ id: string; rev: number }>;
}

async function setup(findings = [cart, total]): Promise<Setup> {
  const root = mkdtempSync(join(tmpdir(), 'layerscope-writes-'));
  const app = await server(root);
  app.run.mockResolvedValue(makeResult({ findings }));
  const post = async (path: string, body: object, headers = {}): Promise<Response> => {
    const response = await app.fetch(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-layerscope-token': app.session.token,
        ...headers,
      },
      body: JSON.stringify(body),
    });
    return response;
  };
  const meta = async (): Promise<{ id: string; rev: number }> => {
    const body = (await (await app.fetch('/api/state')).json()) as { id: string; rev: number };
    return { id: body.id, rev: body.rev };
  };
  return { ...app, file: join(root, 'b.json'), post, meta };
}

describe('baseline writes', () => {
  it('ignores a finding, re-applies the baseline without analyzing, and tells the tab', async () => {
    const { post, meta, file, run, session, fetch } = await setup();
    const before = await meta();
    const messages: LiveMessage[] = [];
    session.live.connect(message => {
      messages.push(message);
    });
    const response = await post('/api/baseline/ignore', { ...before, keys: [KEY] });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      writeId: number;
      rev: number;
      report: { findings: unknown[] };
    };
    expect(body.writeId).toBe(1);
    expect(body.rev).toBe(before.rev + 1);
    expect(body.report.findings).toHaveLength(1);
    const reference = join(mkdtempSync(join(tmpdir(), 'layerscope-ref-')), 'b.json');
    writeBaseline(reference, createBaseline([cart], '/app'));
    expect(readFileSync(file, 'utf8')).toBe(readFileSync(reference, 'utf8'));
    expect(run).toHaveBeenCalledOnce();
    const causes = messages.flatMap(message =>
      message.event === 'snapshot' ? [message.data.cause] : [],
    );
    expect(causes).toEqual(['baseline']);
    const baseline = (await (await fetch('/api/baseline')).json()) as { suppressed: unknown[] };
    expect(baseline.suppressed).toHaveLength(1);
  });

  it('undoes the latest write once, and removes entries', async () => {
    const { post, meta, file } = await setup();
    const written = (await (
      await post('/api/baseline/ignore', { ...(await meta()), keys: [KEY] })
    ).json()) as {
      id: string;
      writeId: number;
    };
    const undone = await post('/api/baseline/undo', { id: written.id, writeId: written.writeId });
    expect(undone.status).toBe(200);
    expect(existsSync(file)).toBe(false);
    expect(
      (await post('/api/baseline/undo', { id: written.id, writeId: written.writeId })).status,
    ).toBe(409);
    await post('/api/baseline/ignore', { ...(await meta()), keys: [KEY] });
    const removed = await post('/api/baseline/remove', { ...(await meta()), keys: [KEY] });
    expect(removed.status).toBe(200);
    expect(readFileSync(file, 'utf8')).toContain('"entries": []');
  });
});

describe('a stale layer-cycle entry', () => {
  it('is listed with a key and removed through the API', async () => {
    const { post, meta, file, fetch } = await setup();
    const entry = {
      rule: 'layer-cycle',
      file: 'gone.vue',
      symbol: 'a → b → a',
      toLayer: 'b',
    };
    writeFileSync(file, JSON.stringify({ version: 1, entries: [entry] }));
    // Reads the baseline again, as the tab does after a change of the file.
    await post('/api/baseline/ignore', { ...(await meta()), keys: [KEY] });
    const view = (await (await fetch('/api/baseline')).json()) as {
      removable: { key: string; symbol: string }[];
    };
    const [stale] = view.removable;
    expect(stale.symbol).toBe('a → b → a');
    const removed = await post('/api/baseline/remove', { ...(await meta()), keys: [stale.key] });
    expect(removed.status).toBe(200);
    expect(readFileSync(file, 'utf8')).not.toContain('a → b → a');
  });
});

const cycle = makeFinding({
  rule: 'layer-cycle',
  symbol: 'a → b → a',
  toLayer: 'b',
  file: '/app/pages/a.vue',
});
const entry = { rule: 'layer-cycle', symbol: 'a → b → a', toLayer: 'b' };
type Counts = { removable: { key: string; count?: number }[]; suppressed: unknown[] };

async function counts(fetch: Setup['fetch']): Promise<Counts> {
  const view = (await (await fetch('/api/baseline')).json()) as Counts;
  return view;
}

/** Two entries for one chain in two files, which is a count of 2, and one live cycle finding. */
async function merged(): Promise<Setup> {
  const app = await setup([cycle, cart]);
  writeFileSync(
    app.file,
    JSON.stringify({
      version: 1,
      entries: [
        { ...entry, file: 'old.vue' },
        { ...entry, file: 'older.vue' },
      ],
    }),
  );
  // Accepting another finding reads the file again, with the two entries merged into one.
  await app.post('/api/baseline/ignore', { ...(await app.meta()), keys: [KEY] });
  return app;
}

describe('a merged cycle entry with a surplus', () => {
  it('lowers the count and keeps the entry that the live finding uses', async () => {
    const app = await merged();
    const before = await counts(app.fetch);
    expect(before.suppressed).toHaveLength(2);
    const [surplus] = before.removable;
    expect(surplus.count ?? 1).toBe(1);
    const removed = await app.post('/api/baseline/remove', {
      ...(await app.meta()),
      keys: [surplus.key],
    });
    expect(removed.status).toBe(200);
    const kept = JSON.parse(readFileSync(app.file, 'utf8')) as {
      entries: { rule: string; count?: number }[];
    };
    const cycles = kept.entries.filter(item => item.rule === 'layer-cycle');
    expect(cycles).toHaveLength(1);
    expect(cycles[0].count).toBeUndefined();
    const after = await counts(app.fetch);
    expect(after.suppressed).toHaveLength(2);
    expect(after.removable).toEqual([]);
  });
});

describe('removing a surplus again', () => {
  it('undoes the removal byte for byte', async () => {
    const app = await merged();
    const text = readFileSync(app.file, 'utf8');
    const [surplus] = (await counts(app.fetch)).removable;
    const removed = (await (
      await app.post('/api/baseline/remove', { ...(await app.meta()), keys: [surplus.key] })
    ).json()) as { id: string; writeId: number };
    await app.post('/api/baseline/undo', { id: removed.id, writeId: removed.writeId });
    expect(readFileSync(app.file, 'utf8')).toBe(text);
  });
});

describe('baseline write safety', () => {
  it('refuses other methods, origins, tokens and bodies, in that order', async () => {
    const { post, meta, fetch, file } = await setup();
    const body = { ...(await meta()), keys: [KEY] };
    expect((await fetch('/api/baseline/ignore')).status).toBe(405);
    expect(
      (await post('/api/baseline/ignore', body, { 'sec-fetch-site': 'cross-site' })).status,
    ).toBe(403);
    expect(
      (await post('/api/baseline/ignore', body, { 'x-layerscope-token': 'guess' })).status,
    ).toBe(403);
    expect((await post('/api/baseline/ignore', { ...body, keys: [] })).status).toBe(400);
    expect((await post('/api/baseline/undo', { id: 'x' })).status).toBe(400);
    const unknown = await post('/api/baseline/ignore', { ...body, keys: ['nope'] });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ keys: ['nope'] });
    expect(existsSync(file)).toBe(false);
  });

  it('answers a stale revision or a foreign id with 409 and the current revision', async () => {
    const { post, meta } = await setup();
    const current = await meta();
    const stale = await post('/api/baseline/ignore', {
      ...current,
      rev: current.rev + 5,
      keys: [KEY],
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject(current);
    expect(
      (await post('/api/baseline/ignore', { ...current, id: 'other', keys: [KEY] })).status,
    ).toBe(409);
  });
});

describe('baseline write ordering', () => {
  it('runs two simultaneous writes as one write and one 409', async () => {
    const { post, meta, file } = await setup();
    const current = await meta();
    const [first, second] = await Promise.all([
      post('/api/baseline/ignore', { ...current, keys: [KEY] }),
      post('/api/baseline/ignore', { ...current, keys: [KEY] }),
    ]);
    expect([first.status, second.status].toSorted((a, b) => a - b)).toEqual([200, 409]);
    const loser = first.status === 409 ? first : second;
    expect(await loser.json()).toMatchObject({ rev: current.rev + 1 });
    const reference = join(mkdtempSync(join(tmpdir(), 'layerscope-ref-')), 'b.json');
    writeBaseline(reference, createBaseline([cart], '/app'));
    expect(readFileSync(file, 'utf8')).toBe(readFileSync(reference, 'utf8'));
  });

  it('accepts ignoring a key that is already in the baseline', async () => {
    const { post, meta, file } = await setup();
    await post('/api/baseline/ignore', { ...(await meta()), keys: [KEY] });
    const text = readFileSync(file, 'utf8');
    const again = await post('/api/baseline/ignore', { ...(await meta()), keys: [KEY] });
    expect(again.status).toBe(200);
    expect(readFileSync(file, 'utf8')).toBe(text);
  });
});
