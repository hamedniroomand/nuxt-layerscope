import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createApp, toNodeListener } from 'h3';
import { afterEach, vi } from 'vite-plus/test';

import { createDevtoolsHandler } from '#src/devtools/handler.ts';
import { DEVTOOLS_ROUTE } from '#src/devtools/index.ts';
import type { Session } from '#src/devtools/session.ts';
import { createSession } from '#src/devtools/session.ts';
import type { AnalyzeResult } from '#src/types.ts';
import { fakeAssets } from '#test/devtools-assets.ts';
import { makeResult } from '#test/factories.ts';

type Run = (options: unknown) => Promise<AnalyzeResult>;

export interface Server {
  origin: string;
  session: Session;
  run: ReturnType<typeof vi.fn<Run>>;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
}

const closers: (() => void)[] = [];

afterEach(() => {
  for (const close of closers.splice(0)) {
    close();
  }
});

/** A real HTTP server, as under `nuxi dev`: closing a connection ends the event stream. */
export async function server(): Promise<Server> {
  const run = vi.fn<Run>().mockResolvedValue(makeResult());
  const session = createSession({ rootDir: '/app', baseline: 'b.json', envKey: () => 'k', run });
  const app = createApp();
  app.use(
    DEVTOOLS_ROUTE,
    createDevtoolsHandler({ session, openInEditor: '/e', assetsDir: fakeAssets() }),
  );
  const http = createServer(toNodeListener(app));
  await new Promise<void>(resolve => {
    http.listen(0, '127.0.0.1', resolve);
  });
  closers.push(() => {
    http.closeAllConnections();
    http.close();
  });
  const { port } = http.address() as AddressInfo;
  const origin = `http://127.0.0.1:${port}`;
  return {
    origin,
    session,
    run,
    fetch: async (path, init) => {
      const response = await fetch(`${origin}${DEVTOOLS_ROUTE}${path}`, init);
      return response;
    },
  };
}
