import type { ComputedRef, ShallowRef } from 'vue';
import { computed, shallowRef } from 'vue';

export interface MultiSelection {
  ids: ShallowRef<Set<string>>;
  count: ComputedRef<number>;
  has: (id: string) => boolean;
  /** Toggles one row; with `range`, every row from the last toggled one to this one. */
  toggle: (id: string, range?: boolean) => void;
  clear: () => void;
}

/** Rows picked for a bulk action, by row id; `order` is the list as shown. */
export function createMultiSelection(order: () => string[]): MultiSelection {
  const ids = shallowRef(new Set<string>());
  let anchor: string | undefined;
  return {
    ids,
    count: computed(() => ids.value.size),
    has: id => ids.value.has(id),
    toggle: (id, range = false) => {
      const next = new Set(ids.value);
      const rows = order();
      const from = anchor === undefined ? -1 : rows.indexOf(anchor);
      const to = rows.indexOf(id);
      if (range && from !== -1 && to !== -1) {
        for (const row of rows.slice(Math.min(from, to), Math.max(from, to) + 1)) {
          next.add(row);
        }
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      anchor = id;
      ids.value = next;
    },
    clear: () => {
      ids.value = new Set();
      anchor = undefined;
    },
  };
}
