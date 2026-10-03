import { reactive } from 'vue';

import type { LiveEvent } from '#src/devtools/live.ts';
import type { ReportResponse } from '#src/devtools/protocol.ts';

import type { Api } from './api.ts';
import { ApiError } from './api.ts';

export interface StoreState {
  data: ReportResponse | null;
  etag: string | null;
  /** The analysis failed; the server's message. */
  error: string | null;
  /** The server did not answer; the last data stays visible. */
  unreachable: boolean;
  loading: boolean;
  running: boolean;
}

type EventMeta = Pick<LiveEvent, 'id' | 'rev' | 'marker' | 'analyzedAt' | 'durationMs'>;

export interface Store {
  state: StoreState;
  load: () => Promise<void>;
  rerun: () => Promise<void>;
  /** Takes a report the server sent with a write. */
  replace: (data: ReportResponse) => void;
  /** Takes the timing from a live event; fetches the report only when it changed. */
  applyEvent: (event: EventMeta) => Promise<void>;
}

function fail(state: StoreState, error: unknown): void {
  if (error instanceof ApiError) {
    state.error = error.message;
    state.unreachable = false;
  } else {
    state.unreachable = true;
  }
}

function succeed(state: StoreState): void {
  state.error = null;
  state.unreachable = false;
}

async function load(api: Api, state: StoreState): Promise<void> {
  state.loading = true;
  try {
    const next = await api.report(state.data === null ? null : state.etag);
    if (next !== null) {
      state.data = next.data;
      state.etag = next.etag;
    }
    succeed(state);
  } catch (error) {
    fail(state, error);
  } finally {
    state.loading = false;
  }
}

async function rerun(api: Api, state: StoreState): Promise<void> {
  state.running = true;
  try {
    state.data = await api.rerun();
    // The next load asks for the whole report once; it then has a current ETag.
    state.etag = null;
    succeed(state);
  } catch (error) {
    fail(state, error);
  } finally {
    state.running = false;
  }
}

/** Report data and request state, shared by every view. */
export function createStore(api: Api): Store {
  const state = reactive<StoreState>({
    data: null,
    etag: null,
    error: null,
    unreachable: false,
    loading: false,
    running: false,
  });
  return {
    state,
    load: async () => {
      await load(api, state);
    },
    rerun: async () => {
      await rerun(api, state);
    },
    replace: data => {
      state.data = data;
      // The next load asks for the whole report once; it then has a current ETag.
      state.etag = null;
      succeed(state);
    },
    applyEvent: async event => {
      const { data } = state;
      const same =
        data !== null &&
        data.id === event.id &&
        data.rev === event.rev &&
        data.marker === event.marker;
      if (!same) {
        await load(api, state);
        return;
      }
      // Same revision and marker: only the time of the run moved, so no request is needed.
      data.analyzedAt = event.analyzedAt;
      data.durationMs = event.durationMs;
    },
  };
}
