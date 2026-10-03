import type { Ref, ShallowRef } from 'vue';
import { shallowRef } from 'vue';

import type { BaselineEntry } from '#src/types.ts';

import type { Api } from './api.ts';
import { ApiError } from './api.ts';
import { plural } from './format.ts';
import type { Store } from './store.ts';

/** One message at a time in the bar at the bottom of the tab. */
export interface Toast {
  message: string;
  /** The toast offers "Show new" and "Reset marker". */
  showsNew: boolean;
  /** The write the toast can undo. */
  undo?: number;
}

export interface BaselineActions {
  /** The latest write this tab made, while it can still be undone. */
  lastWrite: ShallowRef<number | null>;
  /** `true` when the baseline was written. */
  ignore: (keys: string[]) => Promise<boolean>;
  remove: (keys: string[]) => Promise<boolean>;
  undo: () => Promise<void>;
}

const BASELINE = 'layerscope-baseline.json';

/** The key of a baseline entry, as the server's `keyOf` builds it: rule, file, symbol, layer. */
export function entryKey(
  entry: Pick<BaselineEntry, 'rule' | 'file' | 'symbol' | 'toLayer'>,
): string {
  return [entry.rule, entry.file, entry.symbol, entry.toLayer ?? ''].join('\0');
}

function explain(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'The findings changed. Review them and try again.';
  }
  if (error instanceof ApiError && error.status === 403) {
    return 'Refused: the request did not come from this tab.';
  }
  return `The baseline was not written: ${(error as Error).message}`;
}

interface Parts {
  api: Api;
  store: Store;
  toast: Ref<Toast | null>;
  lastWrite: ShallowRef<number | null>;
}

/** Undoes this tab's latest write; the server refuses when another write came after it. */
async function undoLatest({ api, store, toast, lastWrite }: Parts): Promise<void> {
  const writeId = lastWrite.value;
  if (writeId === null) {
    return;
  }
  try {
    store.replace(await api.undo(store.state.data?.id ?? '', writeId));
    toast.value = { message: `Undone. ${BASELINE} is back as it was.`, showsNew: false };
  } catch (error) {
    toast.value = { message: explain(error), showsNew: false };
  }
  lastWrite.value = null;
}

/** Ignore, remove and undo, each one write on the server; the report comes back with it. */
export function createActions(api: Api, store: Store, toast: Ref<Toast | null>): BaselineActions {
  const lastWrite = shallowRef<number | null>(null);
  const meta = (): { id: string; rev: number } => ({
    id: store.state.data?.id ?? '',
    rev: store.state.data?.rev ?? -1,
  });
  const write = async (
    kind: 'ignore' | 'remove',
    keys: string[],
    done: string,
  ): Promise<boolean> => {
    try {
      const response = await api[kind](meta(), keys);
      store.replace(response);
      lastWrite.value = response.writeId;
      toast.value = { message: done, showsNew: false, undo: response.writeId };
      return true;
    } catch (error) {
      toast.value = { message: explain(error), showsNew: false };
      if (error instanceof ApiError && error.status === 409) {
        await store.load();
      }
      return false;
    }
  };
  return {
    lastWrite,
    ignore: async keys => {
      const written = await write(
        'ignore',
        keys,
        `Added ${plural(keys.length, 'entry', 'entries')} to ${BASELINE}. Commit the file to share it.`,
      );
      return written;
    },
    remove: async keys => {
      const written = await write(
        'remove',
        keys,
        `Removed ${plural(keys.length, 'entry', 'entries')} from ${BASELINE}.`,
      );
      return written;
    },
    undo: async () => {
      await undoLatest({ api, store, toast, lastWrite });
    },
  };
}
