import type { ReportResponse, ShellConfig } from '#src/devtools/protocol.ts';

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

export interface Api {
  /** `null` when the server answers 304 for `etag`. */
  report: (etag: string | null) => Promise<{ data: ReportResponse; etag: string | null } | null>;
  rerun: () => Promise<ReportResponse>;
  openInEditor: (file: string, line?: number, column?: number) => Promise<void>;
}

export function createApi(config: ShellConfig, request: typeof fetch = fetch): Api {
  return {
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
      const response = await request(`${config.base}/api/rerun`, { method: 'POST' });
      if (!response.ok) {
        throw await errorOf(response);
      }
      return (await response.json()) as ReportResponse;
    },
    openInEditor: async (file, line = 1, column = 1) => {
      const target = encodeURIComponent(`${file}:${line}:${column}`);
      await request(`${config.openInEditor}?file=${target}`);
    },
  };
}
