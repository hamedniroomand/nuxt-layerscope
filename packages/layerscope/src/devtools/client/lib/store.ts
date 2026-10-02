import { reactive } from 'vue';

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

export interface Store {
  state: StoreState;
  load: () => Promise<void>;
  rerun: () => Promise<void>;
}

function fail(state: StoreState, error: unknown): void {
  if (error instanceof ApiError) {
    state.error = error.message;
    state.unreachable = false;
  } else {
    state.unreachable = true;
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
  const load = async (): Promise<void> => {
    state.loading = true;
    try {
      const next = await api.report(state.data === null ? null : state.etag);
      if (next !== null) {
        state.data = next.data;
        state.etag = next.etag;
      }
      state.error = null;
      state.unreachable = false;
    } catch (error) {
      fail(state, error);
    } finally {
      state.loading = false;
    }
  };
  const rerun = async (): Promise<void> => {
    state.running = true;
    try {
      const data = await api.rerun();
      state.data = data;
      // The same value `/api/report` sends as its ETag.
      state.etag = `"${data.id}-${data.rev}"`;
      state.error = null;
      state.unreachable = false;
    } catch (error) {
      fail(state, error);
    } finally {
      state.running = false;
    }
  };
  return { state, load, rerun };
}
