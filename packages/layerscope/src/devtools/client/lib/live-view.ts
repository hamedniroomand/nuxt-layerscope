import type { ComputedRef, Ref, ShallowRef } from 'vue';
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';

import type { FindingDelta } from '#src/devtools/finding-keys.ts';
import type { LiveEvent } from '#src/devtools/live.ts';

import type { Toast } from './actions.ts';
import type { TabContext } from './context.ts';
import { plural } from './format.ts';
import type { EventSourceLike, LiveClient, LiveHandlers, LiveStatus } from './live.ts';
import { connectLive } from './live.ts';
import type { FrameWindow } from './visibility.ts';
import { isVisible, watchVisibility } from './visibility.ts';

export interface LiveView {
  /** `null` when the browser has no `EventSource`; the header then shows no live status. */
  status: ComputedRef<LiveStatus | null>;
  paused: ComputedRef<boolean>;
  togglePause: () => Promise<void>;
  resetMarker: () => Promise<void>;
}

function total(changes: FindingDelta['added']): number {
  return changes.reduce((sum, change) => sum + change.count, 0);
}

/** "+2 violations, -1 fixed · 3 new since opened", or `null` when nothing changed. */
export function describeEvent(event: LiveEvent): string | null {
  const added = total(event.delta.added);
  const removed = total(event.delta.removed);
  if (added === 0 && removed === 0) {
    return null;
  }
  const parts = [
    ...(added === 0 ? [] : [`+${plural(added, 'violation')}`]),
    ...(removed === 0 ? [] : [`-${removed} fixed`]),
  ];
  const fresh = event.newCount === 0 ? '' : ` · ${event.newCount} new since opened`;
  return `${parts.join(', ')}${fresh}`;
}

/** A failed reload shows in the store's own error state. */
const ignore = (): undefined => undefined;

function openSource(url: string): EventSourceLike {
  return new EventSource(url);
}

/** What the tab does with each live message. */
function liveHandlers(
  context: TabContext,
  toast: Ref<Toast | null>,
  paused: Ref<boolean | null>,
): LiveHandlers {
  const { api, store } = context;
  return {
    snapshot: async event => {
      await store.applyEvent(event);
      // A write from a tab shows its own message; the event only refreshes the data.
      const message = event.cause === 'baseline' ? null : describeEvent(event);
      if (message !== null) {
        toast.value = { message, showsNew: event.newCount > 0 };
      }
    },
    error: message => {
      toast.value = { message: `Live run failed: ${message}`, showsNew: false };
    },
    poll: async () => {
      const state = await api.state();
      paused.value = state.live.paused;
      await store.applyEvent(state);
    },
  };
}

export interface LiveOptions {
  open?: (url: string) => EventSourceLike;
  /** The window whose frames decide whether the tab is visible. */
  host?: FrameWindow;
}

/**
 * Holds the event stream open only while the tab is visible: a hidden tab drops out of the
 * server's client count, so saves stop starting runs. Showing the tab again reconnects and
 * reloads the report, which answers 304 when nothing changed.
 */
function useConnection(
  context: TabContext,
  handlers: LiveHandlers,
  options: LiveOptions,
): ShallowRef<LiveClient | null> {
  const client = shallowRef<LiveClient | null>(null);
  const open = options.open ?? openSource;
  let stop: (() => void) | undefined;
  const connect = (): void => {
    client.value ??= connectLive({ url: context.api.events, open, handlers });
  };
  const disconnect = (): void => {
    client.value?.close();
    client.value = null;
  };
  onMounted(() => {
    if (typeof EventSource === 'undefined' && options.open === undefined) {
      return;
    }
    const host = options.host ?? (globalThis as unknown as FrameWindow);
    if (isVisible(host)) {
      connect();
    }
    stop = watchVisibility(host, visible => {
      if (visible) {
        connect();
        context.store.load().catch(ignore);
      } else {
        disconnect();
      }
    });
  });
  onBeforeUnmount(() => {
    stop?.();
    disconnect();
  });
  return client;
}

/** Connects the tab to the server's live updates while the app is mounted and visible. */
export function useLive(
  context: TabContext,
  toast: Ref<Toast | null>,
  options: LiveOptions = {},
): LiveView {
  const { api, shortcuts } = context;
  // Set by a pause or resume from this tab, before the server's state event arrives.
  const pausedHere = shallowRef<boolean | null>(null);
  const client = useConnection(context, liveHandlers(context, toast, pausedHere), options);
  const paused = computed(() => pausedHere.value ?? client.value?.paused.value ?? false);
  // The server's state event wins once it arrives, also when another tab paused or resumed.
  watch(
    () => client.value?.paused.value,
    () => {
      pausedHere.value = null;
    },
  );
  const togglePause = async (): Promise<void> => {
    const { live } = await api.live(paused.value ? 'resume' : 'pause');
    pausedHere.value = live.paused;
  };
  onBeforeUnmount(
    shortcuts.register({ key: 'p', label: 'Pause or resume live updates', run: togglePause }),
  );
  return {
    status: computed(() => {
      const value = client.value?.status.value ?? null;
      return value === 'live' && paused.value ? 'paused' : value;
    }),
    paused,
    togglePause,
    resetMarker: async () => {
      await api.live('marker');
      toast.value = null;
    },
  };
}
