import type { ShallowRef } from 'vue';
import { onMounted, shallowRef, watch } from 'vue';

import type { TabContext } from './context.ts';

export interface ViewData<T> {
  data: ShallowRef<T | null>;
  error: ShallowRef<string | null>;
  loading: ShallowRef<boolean>;
  reload: () => Promise<void>;
}

/**
 * Data for one view: fetched when the view opens, and again when the revision or the marker
 * changes while it is open. A closed view costs nothing.
 */
export function useViewData<T>(context: TabContext, fetch: () => Promise<T>): ViewData<T> {
  const data = shallowRef<T | null>(null);
  const error = shallowRef<string | null>(null);
  const loading = shallowRef(false);
  const reload = async (): Promise<void> => {
    loading.value = true;
    try {
      data.value = await fetch();
      error.value = null;
    } catch (caught) {
      error.value = (caught as Error).message;
    } finally {
      loading.value = false;
    }
  };
  onMounted(reload);
  watch(
    () => {
      const meta = context.store.state.data;
      return meta === null ? '' : `${meta.id}-${meta.rev}-${meta.marker}`;
    },
    async (now, before) => {
      if (before !== '' && now !== before) {
        await reload();
      }
    },
  );
  return { data, error, loading, reload };
}
