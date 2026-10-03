import { addDevServerHandler } from '@nuxt/kit';
import { join } from 'pathe';

import { BASELINE_FILE } from '#src/baseline/index.ts';
import { onDevtoolsCustomTabs } from '#src/module/nuxt.ts';
import type { Nuxt } from '#src/module/nuxt.ts';

import { computeEnvKey } from './env-key.ts';
import { createDevtoolsHandler } from './handler.ts';
import type { Session } from './session.ts';
import { createSession } from './session.ts';

export const DEVTOOLS_ROUTE = '/__layerscope';

type WatchHook = (name: 'builder:watch', handler: () => void) => unknown;

/** A Nuxt DevTools tab with the layer report, served while `nuxi dev` runs. */
export function setupDevtools(nuxt: Nuxt): void {
  const { rootDir, buildDir, app } = nuxt.options;
  // Created on the first request; until then the hooks below do nothing.
  let session: Session | undefined;
  const invalidate = (): void => session?.live.invalidate();
  nuxt.hook('app:templatesGenerated', invalidate);
  (nuxt.hook as unknown as WatchHook)('builder:watch', invalidate);

  const openInEditor = join('/', app.baseURL, app.buildAssetsDir, '__open-in-editor');
  addDevServerHandler({
    route: DEVTOOLS_ROUTE,
    handler: createDevtoolsHandler({
      get session(): Session {
        session ??= createSession({
          rootDir,
          baseline: BASELINE_FILE,
          envKey: (): string => computeEnvKey(rootDir, buildDir),
        });
        return session;
      },
      openInEditor,
      base: DEVTOOLS_ROUTE,
    }),
  });
  onDevtoolsCustomTabs(nuxt, tabs => {
    tabs.push({
      name: 'layerscope',
      title: 'Layerscope',
      icon: 'carbon:flow-connection',
      view: { type: 'iframe', src: DEVTOOLS_ROUTE },
    });
  });
}
