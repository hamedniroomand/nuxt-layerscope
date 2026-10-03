import type { InjectionKey, Ref } from 'vue';
import { inject } from 'vue';

import type { BaselineActions, Toast } from './actions.ts';
import type { Api } from './api.ts';
import type { Navigation } from './navigation.ts';
import type { Shortcuts } from './shortcuts.ts';
import type { Store } from './store.ts';

export interface TabContext {
  api: Api;
  store: Store;
  nav: Navigation;
  shortcuts: Shortcuts;
  toast: Ref<Toast | null>;
  actions: BaselineActions;
}

export const TAB_CONTEXT: InjectionKey<TabContext> = Symbol('layerscope');

export function useTab(): TabContext {
  const context = inject(TAB_CONTEXT);
  if (context === undefined) {
    throw new Error('The Layerscope tab context is missing');
  }
  return context;
}
