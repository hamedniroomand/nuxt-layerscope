import type { EventHandler, H3Event } from 'h3';
import { defineEventHandler, getQuery, setResponseHeader } from 'h3';

import { api } from './api.ts';
import { assetVersion, defaultAssetsDir, readAsset } from './assets.ts';
import { BASELINE_WRITES, baselineWrite } from './baseline-api.ts';
import { streamEvents } from './events.ts';
import { json, notModified } from './respond.ts';
import type { Session } from './session.ts';
import { renderShell } from './shell.ts';

export interface HandlerInput {
  /** Read on each request, so the session can be created on first use. */
  readonly session: Session;
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

async function page(event: H3Event, _path: string, input: HandlerInput): Promise<string> {
  if (getQuery(event).format === 'json') {
    const snapshot = await input.session.analyzer.refresh();
    const { formatResult } = await import('#src/report/index.ts');
    setResponseHeader(event, 'content-type', JSON_TYPE);
    return formatResult(snapshot.result, 'json', snapshot.result.rootDir);
  }
  setResponseHeader(event, 'content-type', HTML_TYPE);
  setResponseHeader(event, 'cache-control', 'no-cache');
  return renderShell(
    {
      base: input.base ?? '/__layerscope',
      openInEditor: input.openInEditor,
      token: input.session.token,
    },
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

async function events(event: H3Event, _path: string, input: HandlerInput): Promise<string> {
  if (event.method !== 'GET') {
    return json(event, 405, { error: 'Use GET' });
  }
  await streamEvents(event, input.session.live);
  return '';
}

async function apiRoute(event: H3Event, path: string, input: HandlerInput): Promise<string> {
  const body = BASELINE_WRITES.has(path)
    ? await baselineWrite(event, path, input.session)
    : await api(event, path, input.session);
  return body;
}

type Route = (event: H3Event, path: string, input: HandlerInput) => Promise<string>;

function route(path: string): Route {
  if (path === '/' || path === '') {
    return page;
  }
  if (path === '/events') {
    return events;
  }
  return path.startsWith(ASSET_PREFIX) ? asset : apiRoute;
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
