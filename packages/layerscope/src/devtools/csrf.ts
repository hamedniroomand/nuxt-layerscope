import { randomUUID } from 'node:crypto';

import type { H3Event } from 'h3';
import { getHeader } from 'h3';

export const TOKEN_HEADER = 'x-layerscope-token';

/** A random token per dev server process; the shell hands it to the tab, nothing else knows it. */
export function createToken(): string {
  return randomUUID();
}

/** The request carries this process's token, so it comes from a tab this server served. */
export function hasToken(event: H3Event, token: string): boolean {
  return getHeader(event, TOKEN_HEADER) === token;
}
