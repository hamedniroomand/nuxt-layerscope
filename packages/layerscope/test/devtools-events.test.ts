import { describe, expect, it, vi } from 'vite-plus/test';

import type { LiveMessage } from '#src/devtools/live.ts';
import { server } from '#test/devtools-server.ts';
import { makeFinding, makeResult } from '#test/factories.ts';

/** Reads the stream until `text` shows up. */
async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  text: string,
): Promise<string> {
  const decoder = new TextDecoder();
  let received = '';
  while (!received.includes(text)) {
    // eslint-disable-next-line no-await-in-loop -- reads the stream chunk by chunk
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    received += decoder.decode(value);
  }
  return received;
}

describe('devtools event stream', () => {
  it('sends the live state, then a snapshot after a change, and stops on close', async () => {
    const { fetch, session, run } = await server();
    await session.analyzer.get();
    const response = await fetch('/events');
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    expect(await readUntil(reader, 'event: state')).toContain('"clients":1');
    run.mockResolvedValue(makeResult({ findings: [makeFinding()] }));
    const started = Date.now();
    session.live.invalidate();
    const received = await readUntil(reader, 'event: snapshot');
    expect(Date.now() - started).toBeLessThan(1000);
    expect(received).toContain('"newCount":1');
    const stopped = vi.spyOn(globalThis, 'clearInterval');
    await reader.cancel();
    await vi.waitFor(() => {
      expect(session.live.state.clients).toBe(0);
    });
    expect(stopped).toHaveBeenCalled();
  });
});

describe('devtools live api', () => {
  it('reports the live state and pauses and resumes', async () => {
    const { fetch } = await server();
    expect(await (await fetch('/api/state')).json()).toMatchObject({
      live: { clients: 0, paused: false },
    });
    const paused = await fetch('/api/live/pause', { method: 'POST' });
    expect(await paused.json()).toEqual({ live: { clients: 0, paused: true } });
    const resumed = await fetch('/api/live/resume', { method: 'POST' });
    expect(await resumed.json()).toEqual({ live: { clients: 0, paused: false } });
    expect((await fetch('/api/live/pause')).status).toBe(405);
  });

  it('sends a delta for a re-run through the subscription', async () => {
    const { fetch, session, run } = await server();
    await session.analyzer.get();
    const messages: LiveMessage[] = [];
    session.live.connect(message => {
      messages.push(message);
    });
    run.mockResolvedValue(makeResult({ findings: [makeFinding()] }));
    const body = (await (await fetch('/api/rerun', { method: 'POST' })).json()) as {
      report: { newCount: number; findings: { isNew: boolean; key: string }[] };
    };
    expect(body.report.newCount).toBe(1);
    expect(body.report.findings[0]).toMatchObject({ isNew: true });
    const last = messages.at(-1);
    expect(last?.event).toBe('snapshot');
    expect(last?.event === 'snapshot' ? last.data.delta.added : []).toHaveLength(1);
  });
});

describe('devtools live marker and origin', () => {
  it('changes the report etag when the marker moves', async () => {
    const { fetch } = await server();
    const etag = (await fetch('/api/report')).headers.get('etag') ?? '';
    const reset = await fetch('/api/live/marker', { method: 'POST' });
    expect(await reset.json()).toMatchObject({ marker: 1 });
    const after = await fetch('/api/report', { headers: { 'if-none-match': etag } });
    expect(after.status).toBe(200);
    expect(after.headers.get('etag')).not.toBe(etag);
  });

  it('refuses state changes from other origins', async () => {
    const { fetch, run, origin } = await server();
    const post = async (headers: Record<string, string>): Promise<number> => {
      const response = await fetch('/api/rerun', { method: 'POST', headers });
      return response.status;
    };
    expect(await post({ 'sec-fetch-site': 'cross-site' })).toBe(403);
    expect(await post({ 'sec-fetch-site': 'same-site' })).toBe(403);
    expect(await post({ origin: 'http://evil.test' })).toBe(403);
    expect(await post({ origin: 'not a url' })).toBe(403);
    expect(run).not.toHaveBeenCalled();
    expect(await post({ 'sec-fetch-site': 'same-origin' })).toBe(200);
    expect(await post({ origin })).toBe(200);
  });
});
