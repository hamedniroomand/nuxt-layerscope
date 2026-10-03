import { nextTick, onBeforeUnmount, ref } from 'vue';

import type { Toast } from './actions.ts';
import { createActions } from './actions.ts';
import type { Api } from './api.ts';
import { createApi, readConfig } from './api.ts';
import type { TabContext } from './context.ts';
import { createNavigation } from './navigation.ts';
import type { View } from './router.ts';
import { createShortcuts } from './shortcuts.ts';
import { createStore } from './store.ts';

/** Everything the views share, wired to the real window; tests pass their own `api`. */
export function createTabContext(
  win: Window = window,
  api: Api = createApi(readConfig(win.document), win.fetch.bind(win)),
): TabContext {
  const store = createStore(api);
  const toast = ref<Toast | null>(null);
  return {
    api,
    store,
    nav: createNavigation(win),
    shortcuts: createShortcuts(),
    toast,
    actions: createActions(api, store, toast),
  };
}

export interface AppKeys {
  views: View[];
  /** Clears the current selection or closes the current panel. */
  escape: () => void;
}

/** Keys every view shares: `1` to `n` switch views, `/` filters, `r` re-runs, `Esc` clears. */
export function useAppShortcuts(context: TabContext, keys: AppKeys): void {
  const { shortcuts, nav, store } = context;
  const removers = keys.views.map((view, index) =>
    shortcuts.register({
      key: String(index + 1),
      label: `Open ${view}`,
      run: () => {
        nav.open(view);
      },
    }),
  );
  removers.push(
    shortcuts.register({
      key: 'r',
      label: 'Re-run',
      run: async () => {
        await store.rerun();
      },
    }),
    shortcuts.register({
      key: '/',
      label: 'Filter findings',
      run: async () => {
        if (nav.route.value.view !== 'findings') {
          nav.open('findings');
          await nextTick();
        }
        document.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
      },
    }),
    shortcuts.register({ key: 'Escape', label: 'Clear', run: keys.escape, inFields: true }),
  );
  const onKey = (event: KeyboardEvent): void => {
    if (shortcuts.handle(event)) {
      event.preventDefault();
    }
  };
  globalThis.addEventListener('keydown', onKey);
  onBeforeUnmount(() => {
    globalThis.removeEventListener('keydown', onKey);
    for (const remove of removers) {
      remove();
    }
  });
}
