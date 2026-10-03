/**
 * Loads a Nuxt project with the module and prints what the DevTools part registered, as JSON.
 * `devtools.test.ts` runs it in a child process: Nuxt loads the module source through jiti, and
 * in the test process that second copy of `src/devtools` would corrupt the coverage report.
 */
import { loadNuxt } from '@nuxt/kit';

type CallHook = (name: string, ...args: unknown[]) => Promise<unknown>;

const [cwd = '', mode = ''] = process.argv.slice(2);
const nuxt = await loadNuxt({ cwd, dev: mode === 'dev', ready: true });
try {
  const handlers = (nuxt.options as unknown as { devServerHandlers: { route?: string }[] })
    .devServerHandlers;
  const tabs: unknown[] = [];
  const callHook = nuxt.callHook as unknown as CallHook;
  await callHook('devtools:customTabs', tabs);
  // A rescan before the tab is opened must not throw.
  await callHook('builder:watch', 'change', 'app/app.vue');
  process.stdout.write(JSON.stringify({ routes: handlers.map(handler => handler.route), tabs }));
} finally {
  await nuxt.close();
}
