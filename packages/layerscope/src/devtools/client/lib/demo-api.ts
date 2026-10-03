import type { LiveState } from '#src/devtools/live.ts';
import type {
  EdgeView,
  NodeView,
  ReportResponse,
  ShellConfig,
  TraceView,
} from '#src/devtools/protocol.ts';
import { STATIC_PATHS, edgePath, nodePath, traceUrl } from '#src/devtools/static-paths.ts';

import type { Api, StateResponse } from './api.ts';
import { ApiError } from './api.ts';

export const NOT_IN_SNAPSHOT = 'Not available in a snapshot';

const LIVE: { live: LiveState } = { live: { clients: 0, paused: true } };

type ReadFile = <T>(path: string, empty: () => T) => Promise<T>;

const missing = (): never => {
  throw new ApiError(404, 'Not in this snapshot');
};

/** The views' reads, one JSON file each. */
function demoViews(
  file: ReadFile,
): Pick<Api, 'symbols' | 'trace' | 'unused' | 'baseline' | 'graph' | 'edge' | 'node'> {
  return {
    symbols: async () => {
      const data = await file(STATIC_PATHS.symbols, () => ({ symbols: [] }));
      return data;
    },
    trace: async symbol => {
      const empty = (): TraceView => ({ version: 1, symbol, targets: [] });
      const data = await file(traceUrl(symbol), empty);
      return data;
    },
    unused: async () => {
      const data = await file(STATIC_PATHS.unused, missing);
      return data;
    },
    baseline: async () => {
      const data = await file(STATIC_PATHS.baseline, missing);
      return data;
    },
    graph: async () => {
      const data = await file(STATIC_PATHS.graph, missing);
      return data;
    },
    edge: async (from, to) => {
      const empty = (): EdgeView => ({
        from,
        to,
        status: null,
        total: 0,
        truncated: 0,
        symbols: [],
      });
      const data = await file(edgePath(from, to), empty);
      return data;
    },
    node: async layer => {
      const data = await file<NodeView>(nodePath(layer), missing);
      return data;
    },
  };
}

/** What needs the dev server: the report reads its file again, and nothing else exists. */
function demoServer(file: ReadFile): Omit<Api, keyof ReturnType<typeof demoViews>> {
  const refuse = async (): Promise<never> => {
    await Promise.resolve();
    throw new ApiError(405, NOT_IN_SNAPSHOT);
  };
  const report = async (): Promise<ReportResponse> => {
    const data = await file<ReportResponse>(STATIC_PATHS.report, missing);
    return data;
  };
  return {
    events: '',
    report: async () => ({ data: await report(), etag: null }),
    rerun: report,
    state: async () => {
      const data = await file<StateResponse>(STATIC_PATHS.state, missing);
      return data;
    },
    live: async () => {
      await Promise.resolve();
      return LIVE;
    },
    openInEditor: async () => {
      await Promise.resolve();
    },
    ignore: refuse,
    remove: refuse,
    undo: refuse,
  };
}

/**
 * The tab's API over the files of a static snapshot: each read is one JSON file, and the writes,
 * the re-run and the live controls do not exist. A missing file reads as an empty answer.
 */
export function createDemoApi(config: ShellConfig, request: typeof fetch = fetch): Api {
  const file: ReadFile = async <T>(path: string, empty: () => T): Promise<T> => {
    const response = await request(`${config.base}/${path}`);
    if (response.status === 404) {
      return empty();
    }
    if (!response.ok) {
      throw new ApiError(response.status, `HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  };
  return { ...demoServer(file), ...demoViews(file) };
}
