import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { describe, expect, it, vi } from 'vite-plus/test';

import { findingKey } from '#src/devtools/finding-keys.ts';
import { server } from '#test/devtools-server.ts';
import { makeFinding, makeResult } from '#test/factories.ts';

const cart = makeFinding();
const KEY = findingKey(cart, '/app');

/**
 * A tab whose session has no baseline option, so the config of each result names the file. The env
 * key changes with the file name, as it does when the config file changes.
 */
async function setup(): Promise<{
  root: string;
  app: Awaited<ReturnType<typeof server>>;
  post: (path: string, body: object) => Promise<{ status: number; body: unknown }>;
  meta: () => Promise<{ id: string; rev: number }>;
  nameFile: (name: string) => void;
}> {
  const root = mkdtempSync(join(tmpdir(), 'layerscope-key-'));
  const env = { key: '' };
  const app = await server(root, { baseline: undefined, envKey: () => env.key });
  const nameFile = (name: string): void => {
    env.key = name;
    app.run.mockResolvedValue(makeResult({ findings: [cart], config: { baseline: name } }));
  };
  nameFile('one.json');
  const post = async (path: string, body: object): Promise<{ status: number; body: unknown }> => {
    const response = await app.fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-layerscope-token': app.session.token },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const meta = async (): Promise<{ id: string; rev: number }> => {
    const body = (await (await app.fetch('/api/state')).json()) as { id: string; rev: number };
    return { id: body.id, rev: body.rev };
  };
  return { root, app, post, meta, nameFile };
}

describe('the baseline writes of the tab, with the baseline key of the config', () => {
  it('writes the file that the config names', async () => {
    const { root, post, meta } = await setup();
    const written = await post('/api/baseline/ignore', { ...(await meta()), keys: [KEY] });
    expect(written.status).toBe(200);
    expect(existsSync(join(root, 'one.json'))).toBe(true);
    expect(existsSync(join(root, 'layerscope-baseline.json'))).toBe(false);
  });

  // The undo route does not analyze again, so `invalidate` stands in for the Nuxt hook that a
  // change of the config causes. The next snapshot then names the other file.
  it('undoes in the file of the write, also when the config names another file after it', async () => {
    const { root, app, post, meta, nameFile } = await setup();
    const written = (await post('/api/baseline/ignore', { ...(await meta()), keys: [KEY] }))
      .body as { id: string; writeId: number };
    nameFile('two.json');
    app.session.live.invalidate();
    await meta();
    const undone = await post('/api/baseline/undo', { id: written.id, writeId: written.writeId });
    expect(undone.status).toBe(200);
    expect(existsSync(join(root, 'one.json'))).toBe(false);
    expect(existsSync(join(root, 'two.json'))).toBe(false);
  });

  it('gives the old text back to the file of the write, and does not change the other file', async () => {
    const { root, app, post, meta, nameFile } = await setup();
    const empty = '{\n  "version": 1,\n  "entries": []\n}\n';
    writeFileSync(join(root, 'one.json'), empty);
    writeFileSync(join(root, 'two.json'), empty.replace('1', '1 '));
    const written = (await post('/api/baseline/ignore', { ...(await meta()), keys: [KEY] }))
      .body as { id: string; writeId: number };
    expect(readFileSync(join(root, 'one.json'), 'utf8')).not.toBe(empty);
    nameFile('two.json');
    app.session.live.invalidate();
    await meta();
    await post('/api/baseline/undo', { id: written.id, writeId: written.writeId });
    expect(readFileSync(join(root, 'one.json'), 'utf8')).toBe(empty);
    expect(readFileSync(join(root, 'two.json'), 'utf8')).toBe(empty.replace('1', '1 '));
  });
});

describe('the baseline writes of the tab, while a run is in flight', () => {
  it('writes the new file when the config changes while a run with the old config is in flight', async () => {
    const { root, app, post, meta, nameFile } = await setup();
    const before = await meta();
    const old = Promise.withResolvers<ReturnType<typeof makeResult>>();
    app.run.mockReturnValueOnce(old.promise);
    app.session.live.invalidate();
    const inflight = app.session.analyzer.get();
    await vi.waitFor(() => {
      expect(app.run).toHaveBeenCalledTimes(2);
    });
    nameFile('two.json');
    const check = vi.spyOn(app.session.analyzer, 'invalidateIfChanged');
    const written = post('/api/baseline/ignore', { ...before, keys: [KEY] });
    // The old run ends only after the write request has checked the config, so that request sees
    // the run in flight.
    await vi.waitFor(() => {
      expect(check).toHaveBeenCalled();
    });
    await check.mock.results[0]?.value;
    old.resolve(makeResult({ findings: [cart], config: { baseline: 'one.json' } }));
    await inflight;
    expect((await written).status).toBe(200);
    expect(existsSync(join(root, 'two.json'))).toBe(true);
    expect(existsSync(join(root, 'one.json'))).toBe(false);
  });
});

describe('the baseline writes of the tab, when the config changes during the analysis', () => {
  it('refuses the write with 409, and writes no file', async () => {
    const { root, app, post, meta, nameFile } = await setup();
    const before = await meta();
    nameFile('two.json');
    const held = Promise.withResolvers<ReturnType<typeof makeResult>>();
    app.run.mockReturnValueOnce(held.promise);
    const written = post('/api/baseline/ignore', { ...before, keys: [KEY] });
    // The write request sees the change and starts a run. The config changes again while it runs.
    await vi.waitFor(() => {
      expect(app.run).toHaveBeenCalledTimes(2);
    });
    nameFile('three.json');
    held.resolve(makeResult({ findings: [cart], config: { baseline: 'two.json' } }));
    expect((await written).status).toBe(409);
    for (const name of ['one.json', 'two.json', 'three.json']) {
      expect(existsSync(join(root, name))).toBe(false);
    }
  });
});
