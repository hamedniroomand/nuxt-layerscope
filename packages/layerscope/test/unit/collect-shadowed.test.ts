import { describe, expect, it } from 'vite-plus/test';

import { RegistryCollector } from '#src/module/collect.ts';
import type { Component, ComponentsDir, Nuxt } from '#src/module/nuxt.ts';

type Handler = (...args: never[]) => unknown;

/** The slice of Nuxt that the collector reads, with hooks it can fire by name. */
function fakeNuxt(): { nuxt: Nuxt; call: (name: string, ...args: unknown[]) => Promise<void> } {
  const hooks = new Map<string, Handler[]>();
  const nuxt = {
    _version: '0.0.0',
    options: { _layers: [], alias: {}, extensions: ['.vue'], buildDir: '/p/.nuxt' },
    hook: (name: string, handler: Handler): void => {
      hooks.set(name, [...(hooks.get(name) ?? []), handler]);
    },
  };
  const call = async (name: string, ...args: unknown[]): Promise<void> => {
    await Promise.all(
      (hooks.get(name) ?? []).map(handler =>
        (handler as (...values: unknown[]) => unknown)(...args),
      ),
    );
  };
  return { nuxt: nuxt as unknown as Nuxt, call };
}

function component(file: string): Component {
  return { pascalName: 'BaseButton', filePath: file } as unknown as Component;
}

describe('RegistryCollector shadowed components', () => {
  const SHARED = '/p/shared/app/components/BaseButton.vue';
  const SHOP = '/p/shop/app/components/BaseButton.vue';

  /** Like Nuxt: every rescan calls `extendComponent` for each file, then `components:extend`. */
  async function setup(): Promise<{
    rescan: (files: string[], registered: string[]) => Promise<void>;
    shadowed: () => Promise<string[]>;
  }> {
    const { nuxt, call } = fakeNuxt();
    const collector = new RegistryCollector(nuxt, {});
    collector.install();
    const dirs: ComponentsDir[] = [{ path: '/p/shop/app/components' }];
    await call('modules:done');
    await call('components:dirs', dirs);
    const dir: ComponentsDir = dirs[0] ?? { path: '' };
    return {
      async rescan(files, registered): Promise<void> {
        await Promise.all(
          files.map(async file => {
            await dir.extendComponent?.(component(file));
          }),
        );
        await call(
          'components:extend',
          registered.map(file => component(file)),
        );
      },
      async shadowed(): Promise<string[]> {
        return (await collector.collect()).shadowedComponents.map(entry => entry.file);
      },
    };
  }

  it('reports the file that a higher layer replaces', async () => {
    const { rescan, shadowed } = await setup();
    await rescan([SHARED, SHOP], [SHOP]);
    expect(await shadowed()).toEqual([SHARED]);
  });

  it('drops the finding when the shadowing file is deleted or no longer scanned', async () => {
    const { rescan, shadowed } = await setup();
    await rescan([SHARED, SHOP], [SHARED]);
    expect(await shadowed()).toEqual([SHOP]);
    await rescan([SHARED], [SHARED]);
    expect(await shadowed()).toEqual([]);
  });
});
