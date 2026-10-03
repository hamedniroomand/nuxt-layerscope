import type { LiveState } from '#src/devtools/live.ts';
import type {
  BaselineView,
  EdgeView,
  GraphView,
  NodeView,
  ReportResponse,
  ShellConfig,
  SnapshotMeta,
  SymbolEntry,
  TraceView,
  UnusedView,
  WriteResponse,
} from '#src/devtools/protocol.ts';

/** The config the shell embeds; defaults keep the client usable in tests. */
export function readConfig(doc: Document = document): ShellConfig {
  const text = doc.querySelector<HTMLTemplateElement>('#config')?.content.textContent ?? '';
  const fallback: ShellConfig = {
    base: '/__layerscope',
    openInEditor: '/_nuxt/__open-in-editor',
    token: '',
  };
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
  symbols: () => Promise<{ symbols: SymbolEntry[] }>;
  trace: (symbol: string) => Promise<TraceView>;
  unused: () => Promise<UnusedView>;
  baseline: () => Promise<BaselineView>;
  /** `withLayout` asks for the layout above 15 layers, where the server leaves it out. */
  graph: (withLayout?: boolean) => Promise<GraphView>;
  /** Writes the baseline; `rev` must be the revision the tab shows. */
  ignore: (meta: { id: string; rev: number }, keys: string[]) => Promise<WriteResponse>;
  remove: (meta: { id: string; rev: number }, keys: string[]) => Promise<WriteResponse>;
  undo: (id: string, writeId: number) => Promise<WriteResponse>;
  edge: (from: string, to: string) => Promise<EdgeView>;
  node: (layer: string, offset?: number) => Promise<NodeView>;
  /** URL of the server's event stream. */
  events: string;
}

type Call = <T>(path: string, init?: RequestInit) => Promise<T>;

/** The calls behind the Trace, Unused and Baseline views. */
function viewCalls(
  call: Call,
): Pick<Api, 'symbols' | 'trace' | 'unused' | 'baseline' | 'graph' | 'edge' | 'node'> {
  const query = (params: Record<string, string>): string => new URLSearchParams(params).toString();
  return {
    symbols: async () => {
      const data = await call<{ symbols: SymbolEntry[] }>('/api/symbols');
      return data;
    },
    trace: async symbol => {
      const data = await call<TraceView>(`/api/trace?symbol=${encodeURIComponent(symbol)}`);
      return data;
    },
    unused: async () => {
      const data = await call<UnusedView>('/api/unused');
      return data;
    },
    baseline: async () => {
      const data = await call<BaselineView>('/api/baseline');
      return data;
    },
    graph: async (withLayout = false) => {
      const data = await call<GraphView>(withLayout ? '/api/graph?layout=1' : '/api/graph');
      return data;
    },
    edge: async (from, to) => {
      const data = await call<EdgeView>(`/api/edge?${query({ from, to })}`);
      return data;
    },
    node: async (layer, offset = 0) => {
      const data = await call<NodeView>(`/api/node?${query({ layer, offset: String(offset) })}`);
      return data;
    },
  };
}

/** The calls that write the baseline: JSON bodies, and the token that proves the tab sent them. */
function writeCalls(call: Call, token: string): Pick<Api, 'ignore' | 'remove' | 'undo'> {
  const post = async (path: string, body: object): Promise<WriteResponse> => {
    const data = await call<WriteResponse>(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-layerscope-token': token },
      body: JSON.stringify(body),
    });
    return data;
  };
  return {
    ignore: async ({ id, rev }, keys) => {
      const data = await post('/api/baseline/ignore', { id, rev, keys });
      return data;
    },
    remove: async ({ id, rev }, keys) => {
      const data = await post('/api/baseline/remove', { id, rev, keys });
      return data;
    },
    undo: async (id, writeId) => {
      const data = await post('/api/baseline/undo', { id, writeId });
      return data;
    },
  };
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
    ...writeCalls(call, config.token),
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
    ...viewCalls(call),
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
