import type { H3Event } from 'h3';
import { getQuery, setResponseHeader } from 'h3';

import { json, meta, notModified, withReport } from './respond.ts';
import { isSameOrigin } from './same-origin.ts';
import type { Session } from './session.ts';
import type { ViewQuery } from './views-api.ts';
import { VIEW_PATHS, viewBody } from './views-api.ts';

/** POST routes that steer live mode; each answers with the new live state. */
const LIVE_POSTS: Partial<Record<string, (session: Session) => object>> = {
  '/api/live/pause': session => {
    session.live.pause();
    return { live: session.live.state };
  },
  '/api/live/resume': session => {
    session.live.resume();
    return { live: session.live.state };
  },
  '/api/live/marker': session => {
    session.live.resetMarker();
    return { live: session.live.state, marker: session.live.marker };
  },
};

async function post(path: string, session: Session): Promise<object> {
  const live = LIVE_POSTS[path];
  if (live !== undefined) {
    return live(session);
  }
  const snapshot = await session.analyzer.refresh();
  const body = await withReport(snapshot, session);
  return body;
}

async function read(event: H3Event, path: string, session: Session): Promise<string> {
  const snapshot = await session.analyzer.get();
  const { live } = session;
  setResponseHeader(event, 'cache-control', 'no-cache');
  // The marker and the pause flag change what the tab shows without a new revision.
  const etag = `"${snapshot.id}-${snapshot.rev}-${live.marker}-${live.state.paused ? 1 : 0}"`;
  if (notModified(event, etag)) {
    return '';
  }
  if (path === '/api/state') {
    return json(event, 200, { ...meta(snapshot, session), status: 'ready', live: live.state });
  }
  if (path === '/api/report') {
    return json(event, 200, await withReport(snapshot, session));
  }
  const query = Object.fromEntries(
    Object.entries(getQuery(event)).filter(entry => typeof entry[1] === 'string'),
  ) as ViewQuery;
  const body = await viewBody(path, snapshot.result, query);
  return body === null ? json(event, 404, { error: 'Unknown layer' }) : json(event, 200, body);
}

/** `/api/*`: GET routes read the cached snapshot; POST routes re-run or steer live mode. */
export async function api(event: H3Event, path: string, session: Session): Promise<string> {
  if (path === '/api/rerun' || path in LIVE_POSTS) {
    if (event.method !== 'POST') {
      return json(event, 405, { error: 'Use POST' });
    }
    return isSameOrigin(event)
      ? json(event, 200, await post(path, session))
      : json(event, 403, { error: 'Cross-origin requests are not allowed' });
  }
  if (path !== '/api/state' && path !== '/api/report' && !VIEW_PATHS.includes(path)) {
    return json(event, 404, { error: `Not found: ${path}` });
  }
  if (event.method !== 'GET') {
    return json(event, 405, { error: 'Use GET' });
  }
  const body = await read(event, path, session);
  return body;
}
