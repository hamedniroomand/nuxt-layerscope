import { addDevServerHandler } from '@nuxt/kit';
import { defineEventHandler, getQuery, setResponseHeader } from 'h3';
import { join } from 'pathe';

import { onDevtoolsCustomTabs } from '#src/module/nuxt.ts';
import type { Nuxt } from '#src/module/nuxt.ts';

import { renderError, renderPage } from './page.ts';

export const DEVTOOLS_ROUTE = '/__layerscope';

async function renderReport(nuxt: Nuxt, format: unknown): Promise<string> {
  // Loaded on request, so the parser and compiler stay out of Nuxt's startup.
  const [{ analyze }, { formatResult }] = await Promise.all([
    import('#src/analyze/index.ts'),
    import('#src/report/index.ts'),
  ]);
  const { rootDir, app } = nuxt.options;
  const result = await analyze({ rootDir });
  if (format === 'json') {
    return formatResult(result, 'json', rootDir);
  }
  const openInEditor = join('/', app.baseURL, app.buildAssetsDir, '__open-in-editor');
  return renderPage({ result, openInEditor });
}

/** A Nuxt DevTools tab with the layer report, served while `nuxi dev` runs. */
export function setupDevtools(nuxt: Nuxt): void {
  addDevServerHandler({
    route: DEVTOOLS_ROUTE,
    handler: defineEventHandler(async event => {
      const { format } = getQuery(event);
      setResponseHeader(
        event,
        'content-type',
        format === 'json' ? 'application/json' : 'text/html; charset=utf-8',
      );
      try {
        return await renderReport(nuxt, format);
      } catch (error) {
        return renderError((error as Error).message);
      }
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
