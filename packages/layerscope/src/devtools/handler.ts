import type { EventHandler, H3Event } from 'h3';
import { defineEventHandler, getHeader, getQuery, setResponseHeader, setResponseStatus } from 'h3';

import type { Analyzer, Snapshot } from './analyzer.ts';
import { renderError, renderPage } from './page.ts';

export interface HandlerInput {
  /** Read on each request, so the analyzer can be created on first use. */
  readonly analyzer: Analyzer;
  /** Vite's open-in-editor endpoint, such as `/_nuxt/__open-in-editor`. */
  openInEditor: string;
}

const JSON_TYPE = 'application/json';
const HTML_TYPE = 'text/html; charset=utf-8';

function meta({
  rev,
  analyzedAt,
  durationMs,
}: Snapshot): Pick<Snapshot, 'analyzedAt' | 'durationMs' | 'rev'> {
  return { rev, analyzedAt, durationMs };
}

async function reportOf(snapshot: Snapshot): Promise<unknown> {
  // Loaded on request, so the report code stays out of Nuxt's startup.
  const { formatResult } = await import('#src/report/index.ts');
  const { rootDir } = snapshot.result;
  return JSON.parse(formatResult(snapshot.result, 'json', rootDir));
}

function json(event: H3Event, status: number, body: unknown): string {
  setResponseStatus(event, status);
  setResponseHeader(event, 'content-type', JSON_TYPE);
  return JSON.stringify(body);
}

async function page(event: H3Event, input: HandlerInput): Promise<string> {
  const snapshot = await input.analyzer.refresh();
  if (getQuery(event).format === 'json') {
    setResponseHeader(event, 'content-type', JSON_TYPE);
    return JSON.stringify(await reportOf(snapshot));
  }
  setResponseHeader(event, 'content-type', HTML_TYPE);
  return renderPage({ result: snapshot.result, openInEditor: input.openInEditor });
}

async function withReport(snapshot: Snapshot): Promise<unknown> {
  return { ...meta(snapshot), report: await reportOf(snapshot) };
}

async function api(event: H3Event, path: string, input: HandlerInput): Promise<string> {
  if (path === '/api/rerun') {
    return event.method === 'POST'
      ? json(event, 200, await withReport(await input.analyzer.refresh()))
      : json(event, 405, { error: 'Use POST' });
  }
  if (path !== '/api/state' && path !== '/api/report') {
    return json(event, 404, { error: `Not found: ${path}` });
  }
  if (event.method !== 'GET') {
    return json(event, 405, { error: 'Use GET' });
  }
  const snapshot = await input.analyzer.get();
  const etag = `"${snapshot.id}-${snapshot.rev}"`;
  setResponseHeader(event, 'etag', etag);
  setResponseHeader(event, 'cache-control', 'no-cache');
  if (getHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304);
    return '';
  }
  return json(
    event,
    200,
    path === '/api/state' ? { ...meta(snapshot), status: 'ready' } : await withReport(snapshot),
  );
}

/** The DevTools tab, mounted at `/__layerscope`: the page, its JSON report and `/api/*`. */
export function createDevtoolsHandler(input: HandlerInput): EventHandler {
  return defineEventHandler(async event => {
    const path = event.path.split('?')[0] ?? '/';
    const isPage = path === '/' || path === '';
    try {
      return isPage ? await page(event, input) : await api(event, path, input);
    } catch (error) {
      const message = (error as Error).message;
      if (isPage) {
        setResponseHeader(event, 'content-type', HTML_TYPE);
        return renderError(message);
      }
      return json(event, 500, { error: message });
    }
  });
}
