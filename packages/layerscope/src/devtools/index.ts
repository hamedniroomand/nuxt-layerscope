import { addDevServerHandler } from '@nuxt/kit';
import { join } from 'pathe';

import { BASELINE_FILE } from '#src/baseline/index.ts';
import { onDevtoolsCustomTabs } from '#src/module/nuxt.ts';
import type { Nuxt } from '#src/module/nuxt.ts';

import { Analyzer } from './analyzer.ts';
import { computeEnvKey } from './env-key.ts';
import { createDevtoolsHandler } from './handler.ts';

export const DEVTOOLS_ROUTE = '/__layerscope';

type WatchHook = (name: 'builder:watch', handler: () => void) => unknown;

/** A Nuxt DevTools tab with the layer report, served while `nuxi dev` runs. */
export function setupDevtools(nuxt: Nuxt): void {
  const { rootDir, buildDir, app } = nuxt.options;
  // Created on the first request; until then the hooks below do nothing.
  let analyzer: Analyzer | undefined;
  const invalidate = (): void => analyzer?.invalidate();
  nuxt.hook('app:templatesGenerated', invalidate);
  (nuxt.hook as unknown as WatchHook)('builder:watch', invalidate);

  const openInEditor = join('/', app.baseURL, app.buildAssetsDir, '__open-in-editor');
  addDevServerHandler({
    route: DEVTOOLS_ROUTE,
    handler: createDevtoolsHandler({
      get analyzer(): Analyzer {
        analyzer ??= new Analyzer({
          rootDir,
          baseline: BASELINE_FILE,
          envKey: (): string => computeEnvKey(rootDir, buildDir),
        });
        return analyzer;
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
