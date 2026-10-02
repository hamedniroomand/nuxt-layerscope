import type { InjectionKey } from 'vue';
import { inject } from 'vue';

import type { Api } from './api.ts';
import type { Navigation } from './navigation.ts';
import type { Shortcuts } from './shortcuts.ts';
import type { Store } from './store.ts';

export interface TabContext {
  api: Api;
  store: Store;
  nav: Navigation;
  shortcuts: Shortcuts;
}

export const TAB_CONTEXT: InjectionKey<TabContext> = Symbol('layerscope');

export function useTab(): TabContext {
  const context = inject(TAB_CONTEXT);
  if (context === undefined) {
    throw new Error('The Layerscope tab context is missing');
  }
  return context;
}
