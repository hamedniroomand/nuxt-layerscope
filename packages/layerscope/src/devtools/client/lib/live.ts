import type { ShallowRef } from 'vue';
import { shallowRef } from 'vue';

import type { LiveEvent, LiveState } from '#src/devtools/live.ts';

/** `polling`: the event stream failed twice; the state is polled and there is no live dot. */
export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'paused' | 'polling';

/** The slice of `EventSource` the client uses, so tests can pass a fake. */
export interface EventSourceLike {
  addEventListener: (type: string, listener: (event: MessageEvent<string>) => void) => void;
  close: () => void;
  onopen: ((event: Event) => unknown) | null;
  onerror: ((event: Event) => unknown) | null;
}

export interface LiveHandlers {
  snapshot: (event: LiveEvent) => Promise<void>;
  /** A live run failed; the server's message. */
  error: (message: string) => void;
  /** Called while polling; resolves `true` when the server has something new. */
  poll: () => Promise<unknown>;
}

export interface LiveClientOptions {
  url: string;
  open: (url: string) => EventSourceLike;
  handlers: LiveHandlers;
  pollMs?: number;
}

export interface LiveClient {
  status: ShallowRef<LiveStatus>;
  paused: ShallowRef<boolean>;
  close: () => void;
}

const POLL_MS = 3000;

/** A failed poll or handler is retried by the next message. */
const ignore = (): undefined => undefined;

function parse<T>(event: MessageEvent<string>): T {
  return JSON.parse(event.data) as T;
}

/** Wires one event source to the handlers. */
function listen(
  source: EventSourceLike,
  live: LiveClient,
  handlers: LiveHandlers,
  settle: () => void,
): void {
  source.addEventListener('state', event => {
    live.paused.value = parse<{ live: LiveState }>(event).live.paused;
    settle();
  });
  source.addEventListener('snapshot', event => {
    handlers.snapshot(parse<LiveEvent>(event)).catch(ignore);
  });
  source.addEventListener('error', event => {
    // The browser's own connection errors carry no data; those go to `onerror`.
    if (typeof event.data === 'string' && event.data !== '') {
      handlers.error(parse<{ error: string }>(event).error);
    }
  });
}

interface Poller {
  start: () => void;
  stop: () => void;
  readonly active: boolean;
  /** Called every tenth poll to try the event stream again. */
  retry: () => void;
}

/** Polls the server while the event stream is down. */
function createPoller(poll: () => Promise<unknown>, ms: number): Poller {
  let timer: ReturnType<typeof setInterval> | undefined;
  let polls = 0;
  const poller: Poller = {
    get active(): boolean {
      return timer !== undefined;
    },
    retry: ignore,
    start: () => {
      timer ??= setInterval(() => {
        polls += 1;
        poll().catch(ignore);
        if (polls % 10 === 0) {
          poller.retry();
        }
      }, ms);
    },
    stop: () => {
      clearInterval(timer);
      timer = undefined;
    },
  };
  return poller;
}

/**
 * Follows the server's event stream. After two failures in a row it polls instead, and tries the
 * stream again every tenth poll, so a server that comes back gets live updates again.
 */
export function connectLive(options: LiveClientOptions): LiveClient {
  const live: LiveClient = {
    status: shallowRef('connecting'),
    paused: shallowRef(false),
    close: ignore,
  };
  const { handlers } = options;
  let failures = 0;
  let source: EventSourceLike | undefined;
  const settle = (): void => {
    live.status.value = live.paused.value ? 'paused' : 'live';
  };
  const poller = createPoller(handlers.poll, options.pollMs ?? POLL_MS);
  const start = (): void => {
    const current = options.open(options.url);
    source = current;
    current.onopen = (): void => {
      failures = 0;
      poller.stop();
      settle();
    };
    current.onerror = (): void => {
      failures += 1;
      if (poller.active || failures >= 2) {
        current.close();
        live.status.value = 'polling';
        poller.start();
        return;
      }
      live.status.value = 'reconnecting';
    };
    listen(current, live, handlers, settle);
  };
  poller.retry = start;
  start();
  live.close = (): void => {
    poller.stop();
    source?.close();
  };
  return live;
}
