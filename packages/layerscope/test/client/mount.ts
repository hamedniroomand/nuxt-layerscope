import type { VueWrapper } from '@vue/test-utils';
import { flushPromises, mount } from '@vue/test-utils';
import { vi } from 'vite-plus/test';

import App from '#src/devtools/client/App.vue';
import type { Api } from '#src/devtools/client/lib/api.ts';
import { createTabContext } from '#src/devtools/client/lib/app.ts';
import { TAB_CONTEXT } from '#src/devtools/client/lib/context.ts';
import type { ReportResponse } from '#src/devtools/protocol.ts';
import { reportResponse, sampleFindings } from '#test/client/fixtures.ts';

export interface Mounted {
  wrapper: VueWrapper;
  api: Api;
}

export function fakeApi(data: ReportResponse | Error): Api {
  const report = vi.fn<Api['report']>();
  if (data instanceof Error) {
    report.mockRejectedValue(data);
  } else {
    report.mockResolvedValue({ data, etag: '"a-0"' });
  }
  return {
    events: '/__layerscope/events',
    symbols: vi.fn<Api['symbols']>().mockResolvedValue({ symbols: [] }),
    trace: vi.fn<Api['trace']>().mockResolvedValue({ version: 1, symbol: '', targets: [] }),
    unused: vi
      .fn<Api['unused']>()
      .mockResolvedValue({ unused: [], possiblyUsed: false, layers: [] }),
    graph: vi.fn<Api['graph']>().mockRejectedValue(new Error('no graph in this test')),
    edge: vi.fn<Api['edge']>().mockRejectedValue(new Error('no edge in this test')),
    node: vi.fn<Api['node']>().mockRejectedValue(new Error('no node in this test')),
    baseline: vi
      .fn<Api['baseline']>()
      .mockResolvedValue({ file: null, suppressed: [], removable: [] }),
    state: vi.fn<Api['state']>().mockRejectedValue(new Error('not used')),
    live: vi.fn<Api['live']>().mockResolvedValue({ live: { clients: 1, paused: true } }),
    report,
    rerun: vi.fn<Api['rerun']>().mockResolvedValue(data instanceof Error ? reportResponse() : data),
    openInEditor: vi.fn<Api['openInEditor']>().mockResolvedValue(),
  };
}

export async function mountApp(data: ReportResponse | Error = reportResponse()): Promise<Mounted> {
  const api = fakeApi(data);
  const wrapper = mount(App, {
    attachTo: document.body,
    global: { provide: { [TAB_CONTEXT as symbol]: createTabContext(window, api) } },
  });
  await flushPromises();
  return { wrapper, api };
}

export function press(key: string): void {
  globalThis.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

export function withFindings(): ReportResponse {
  const findings = sampleFindings();
  return reportResponse({
    findings,
    summary: { files: 3, errors: 2, warnings: 1 },
    hotFiles: [
      { file: 'pages/index.vue', absFile: '/app/pages/index.vue', errors: 1, warnings: 0 },
    ],
  });
}
