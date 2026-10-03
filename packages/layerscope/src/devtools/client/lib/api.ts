import type { LiveState } from '#src/devtools/live.ts';
import type { ReportResponse, ShellConfig, SnapshotMeta } from '#src/devtools/protocol.ts';

/** The config the shell embeds; defaults keep the client usable in tests. */
export function readConfig(doc: Document = document): ShellConfig {
  const text = doc.querySelector<HTMLTemplateElement>('#config')?.content.textContent ?? '';
  const fallback: ShellConfig = { base: '/__layerscope', openInEditor: '/_nuxt/__open-in-editor' };
  if (text === '') {
    return fallback;
  }
  return { ...fallback, ...(JSON.parse(text) as Partial<ShellConfig>) };
}

export class ApiError extends Error {
  public readonly status: number;

  public constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function errorOf(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return new ApiError(response.status, body.error ?? `HTTP ${response.status}`);
}

export type LiveAction = 'pause' | 'resume' | 'marker';

export interface StateResponse extends SnapshotMeta {
  live: LiveState;
}

export interface Api {
  /** `null` when the server answers 304 for `etag`. */
  report: (etag: string | null) => Promise<{ data: ReportResponse; etag: string | null } | null>;
  rerun: () => Promise<ReportResponse>;
  /** Revision, marker and live state; polled when the event stream is not available. */
  state: () => Promise<StateResponse>;
  live: (action: LiveAction) => Promise<{ live: LiveState }>;
  openInEditor: (file: string, line?: number, column?: number) => Promise<void>;
  /** URL of the server's event stream. */
  events: string;
}

export function createApi(config: ShellConfig, request: typeof fetch = fetch): Api {
  const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await request(`${config.base}${path}`, init);
    if (!response.ok) {
      throw await errorOf(response);
    }
    return (await response.json()) as T;
  };
  return {
    events: `${config.base}/events`,
    report: async etag => {
      const headers: HeadersInit = etag === null ? {} : { 'if-none-match': etag };
      const response = await request(`${config.base}/api/report`, { headers });
      if (response.status === 304) {
        return null;
      }
      if (!response.ok) {
        throw await errorOf(response);
      }
      const data = (await response.json()) as ReportResponse;
      return { data, etag: response.headers.get('etag') };
    },
    rerun: async () => {
      const data = await call<ReportResponse>('/api/rerun', { method: 'POST' });
      return data;
    },
    state: async () => {
      const data = await call<StateResponse>('/api/state');
      return data;
    },
    live: async action => {
      const data = await call<{ live: LiveState }>(`/api/live/${action}`, { method: 'POST' });
      return data;
    },
    openInEditor: async (file, line = 1, column = 1) => {
      const target = encodeURIComponent(`${file}:${line}:${column}`);
      await request(`${config.openInEditor}?file=${target}`);
    },
  };
}
