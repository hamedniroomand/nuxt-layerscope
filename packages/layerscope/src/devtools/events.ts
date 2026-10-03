import type { H3Event } from 'h3';
import { createEventStream } from 'h3';

import type { Live, LiveMessage } from './live.ts';

const HEARTBEAT_MS = 25_000;

/**
 * `GET /events`: server-sent events for one open tab. A connected tab turns on live re-runs; the
 * stream ends, and the tab stops counting, when the connection closes.
 */
export async function streamEvents(event: H3Event, live: Live): Promise<void> {
  const stream = createEventStream(event);
  const push = async (message: LiveMessage): Promise<void> => {
    await stream.push({ event: message.event, data: JSON.stringify(message.data) });
  };
  // A push can fail once the client is gone; the close handler cleans up.
  const ignore = (): undefined => undefined;
  const disconnect = live.connect(message => {
    push(message).catch(ignore);
  });
  // The event stream has no comment field; a named event the client ignores keeps proxies open.
  const heartbeat = setInterval(() => {
    stream.push({ event: 'ping', data: '' }).catch(ignore);
  }, HEARTBEAT_MS);
  stream.onClosed(() => {
    clearInterval(heartbeat);
    disconnect();
  });
  push({ event: 'state', data: { live: live.state } }).catch(ignore);
  await stream.send();
}
