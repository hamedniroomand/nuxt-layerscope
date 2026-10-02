import type { EventHandler, H3Event } from 'h3';
import { defineEventHandler, getHeader, getQuery, setResponseHeader, setResponseStatus } from 'h3';

import type { Analyzer, Snapshot } from './analyzer.ts';
import { assetVersion, defaultAssetsDir, readAsset } from './assets.ts';
import type { ReportResponse, SnapshotMeta } from './protocol.ts';
import { tabReport } from './report.ts';
import { renderShell } from './shell.ts';

export interface HandlerInput {
  /** Read on each request, so the analyzer can be created on first use. */
  readonly analyzer: Analyzer;
  /** Vite's open-in-editor endpoint, such as `/_nuxt/__open-in-editor`. */
  openInEditor: string;
  /** Route the handler is mounted at. Defaults to `/__layerscope`. */
  base?: string;
  /** Directory of the built client. Defaults to `dist/devtools` of this package. */
  assetsDir?: string;
}

const JSON_TYPE = 'application/json';
const HTML_TYPE = 'text/html; charset=utf-8';
const ASSET_PREFIX = '/assets/';

function meta({ id, rev, analyzedAt, durationMs }: Snapshot): SnapshotMeta {
  return { id, rev, analyzedAt, durationMs };
}

function json(event: H3Event, status: number, body: unknown): string {
  setResponseStatus(event, status);
  setResponseHeader(event, 'content-type', JSON_TYPE);
  return JSON.stringify(body);
}

/** Sets the ETag and answers `true` when the client already has this version. */
function notModified(event: H3Event, etag: string): boolean {
  setResponseHeader(event, 'etag', etag);
  if (getHeader(event, 'if-none-match') !== etag) {
    return false;
  }
  setResponseStatus(event, 304);
  return true;
}

async function page(event: H3Event, _path: string, input: HandlerInput): Promise<string> {
  if (getQuery(event).format === 'json') {
    const snapshot = await input.analyzer.refresh();
    const { formatResult } = await import('#src/report/index.ts');
    setResponseHeader(event, 'content-type', JSON_TYPE);
    return formatResult(snapshot.result, 'json', snapshot.result.rootDir);
  }
  setResponseHeader(event, 'content-type', HTML_TYPE);
  setResponseHeader(event, 'cache-control', 'no-cache');
  return renderShell(
    { base: input.base ?? '/__layerscope', openInEditor: input.openInEditor },
    assetVersion(input.assetsDir ?? defaultAssetsDir()),
  );
}

async function asset(event: H3Event, path: string, input: HandlerInput): Promise<string> {
  const dir = input.assetsDir ?? defaultAssetsDir();
  const file = await readAsset(dir, path.slice(ASSET_PREFIX.length));
  if (file === null) {
    return json(event, 404, { error: `Not found: ${path}` });
  }
  setResponseHeader(event, 'cache-control', 'max-age=31536000, immutable');
  if (notModified(event, `"${assetVersion(dir)}"`)) {
    return '';
  }
  setResponseHeader(event, 'content-type', file.type);
  return file.body;
}

async function withReport(snapshot: Snapshot): Promise<ReportResponse> {
  return { ...meta(snapshot), report: await tabReport(snapshot.result) };
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
  setResponseHeader(event, 'cache-control', 'no-cache');
  if (notModified(event, `"${snapshot.id}-${snapshot.rev}"`)) {
    return '';
  }
  return json(
    event,
    200,
    path === '/api/state' ? { ...meta(snapshot), status: 'ready' } : await withReport(snapshot),
  );
}

type Route = (event: H3Event, path: string, input: HandlerInput) => Promise<string>;

function route(path: string): Route {
  if (path === '/' || path === '') {
    return page;
  }
  return path.startsWith(ASSET_PREFIX) ? asset : api;
}

/** The DevTools tab, mounted at `/__layerscope`: the client shell, its assets and `/api/*`. */
export function createDevtoolsHandler(input: HandlerInput): EventHandler {
  return defineEventHandler(async event => {
    const path = event.path.split('?')[0] ?? '/';
    try {
      return await route(path)(event, path, input);
    } catch (error) {
      return json(event, 500, { error: (error as Error).message });
    }
  });
}
