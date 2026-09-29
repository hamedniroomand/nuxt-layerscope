import { loadNuxt } from '@nuxt/kit';
import { describe, expect, it } from 'vite-plus/test';

import { DEVTOOLS_ROUTE } from '#src/devtools/index.ts';
import type { DevtoolsTab } from '#src/module/nuxt.ts';
import { NUXT4_ROOT } from '#test/fixtures.ts';

type CallCustomTabs = (name: 'devtools:customTabs', tabs: DevtoolsTab[]) => Promise<unknown>;

interface DevServerHandler {
  route?: string;
}

describe('devtools tab', () => {
  it('registers the tab and its dev route under nuxi dev', async () => {
    const nuxt = await loadNuxt({ cwd: NUXT4_ROOT, dev: true, ready: true });
    try {
      const handlers = (nuxt.options as unknown as { devServerHandlers: DevServerHandler[] })
        .devServerHandlers;
      expect(handlers.map(handler => handler.route)).toContain(DEVTOOLS_ROUTE);
      const tabs: DevtoolsTab[] = [];
      await (nuxt.callHook as unknown as CallCustomTabs)('devtools:customTabs', tabs);
      expect(tabs).toContainEqual(
        expect.objectContaining({
          name: 'layerscope',
          view: { type: 'iframe', src: DEVTOOLS_ROUTE },
        }),
      );
    } finally {
      await nuxt.close();
    }
  });
});
