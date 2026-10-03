/**
 * Loads a Nuxt project with the module and prints what the DevTools part registered, as JSON.
 * `devtools.test.ts` runs it in a child process: Nuxt loads the module source through jiti, and
 * in the test process that second copy of `src/devtools` would corrupt the coverage report.
 */
import { loadNuxt } from '@nuxt/kit';

type CallHook = (name: string, ...args: unknown[]) => Promise<unknown>;

const [cwd = '', mode = ''] = process.argv.slice(2);
const nuxt = await loadNuxt({
  cwd,
  dev: mode === 'dev',
  ready: true,
  ...(mode === 'static' && { overrides: { layerscope: { devtools: { static: true } } } }),
});
try {
  const handlers = (nuxt.options as unknown as { devServerHandlers: { route?: string }[] })
    .devServerHandlers;
  const tabs: unknown[] = [];
  const callHook = nuxt.callHook as unknown as CallHook;
  await callHook('devtools:customTabs', tabs);
  // A rescan before the tab is opened must not throw.
  await callHook('builder:watch', 'change', 'app/app.vue');
  // Handlers of the hook that writes the static snapshot, from any module.
  const hooks = (nuxt.hooks as unknown as { _hooks: Record<string, unknown[] | undefined> })._hooks;
  const publicAssets = hooks['nitro:build:public-assets']?.length ?? 0;
  // What the module adds to Nitro's prerender ignore list. Nuxt's own handlers need a full config,
  // so each handler runs on a near-empty one, and the ones that throw are left out.
  const nitroConfig: { prerender?: { ignore?: unknown[] } } = {};
  const configHandlers = (hooks['nitro:config'] ?? []) as ((config: object) => unknown)[];
  await Promise.allSettled(
    configHandlers.map(async handler => {
      await handler(nitroConfig);
    }),
  );
  const prerenderIgnore = nitroConfig.prerender?.ignore ?? [];
  process.stdout.write(
    JSON.stringify({
      routes: handlers.map(handler => handler.route),
      tabs,
      publicAssets,
      prerenderIgnore,
    }),
  );
} finally {
  await nuxt.close();
}
