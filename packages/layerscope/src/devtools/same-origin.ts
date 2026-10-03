import type { H3Event } from 'h3';
import { getHeader } from 'h3';

/**
 * Any web page can send requests to localhost, so routes that change state accept only the tab's
 * own origin: a same-origin fetch, a request typed into the address bar, or a matching `Origin`.
 */
export function isSameOrigin(event: H3Event): boolean {
  const site = getHeader(event, 'sec-fetch-site');
  if (site !== undefined) {
    return site === 'same-origin' || site === 'none';
  }
  const origin = getHeader(event, 'origin');
  if (origin === undefined) {
    // Not sent by a browser; a page cannot leave out both headers.
    return true;
  }
  try {
    return new URL(origin).host === getHeader(event, 'host');
  } catch {
    return false;
  }
}
