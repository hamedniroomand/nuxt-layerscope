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

/** Follows the server's event stream; falls back to polling when the stream keeps failing. */
export function connectLive(options: LiveClientOptions): LiveClient {
  const status = shallowRef<LiveStatus>('connecting');
  const paused = shallowRef(false);
  const { handlers } = options;
  let failures = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const settle = (): void => {
    if (status.value !== 'polling') {
      status.value = paused.value ? 'paused' : 'live';
    }
  };
  const source = options.open(options.url);
  source.onopen = (): void => {
    failures = 0;
    settle();
  };
  source.onerror = (): void => {
    failures += 1;
    if (failures < 2) {
      status.value = 'reconnecting';
      return;
    }
    source.close();
    status.value = 'polling';
    timer = setInterval(() => {
      handlers.poll().catch(ignore);
    }, options.pollMs ?? POLL_MS);
  };
  source.addEventListener('state', event => {
    paused.value = parse<{ live: LiveState }>(event).live.paused;
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
  return {
    status,
    paused,
    close: (): void => {
      clearInterval(timer);
      source.close();
    },
  };
}
