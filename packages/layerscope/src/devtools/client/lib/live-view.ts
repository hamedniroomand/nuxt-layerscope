import type { ComputedRef, Ref } from 'vue';
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';

import type { FindingDelta } from '#src/devtools/finding-keys.ts';
import type { LiveEvent } from '#src/devtools/live.ts';

import type { TabContext } from './context.ts';
import { plural } from './format.ts';
import type { EventSourceLike, LiveClient, LiveHandlers, LiveStatus } from './live.ts';
import { connectLive } from './live.ts';

export interface Toast {
  message: string;
  /** The toast offers "Show new" and "Reset marker". */
  showsNew: boolean;
}

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
      const message = describeEvent(event);
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

/** Connects the tab to the server's live updates while the app is mounted. */
export function useLive(
  context: TabContext,
  toast: Ref<Toast | null>,
  open: (url: string) => EventSourceLike = openSource,
): LiveView {
  const { api, shortcuts } = context;
  const client = shallowRef<LiveClient | null>(null);
  // Set by a pause or resume from this tab, before the server's state event arrives.
  const pausedHere = shallowRef<boolean | null>(null);
  const paused = computed(() => pausedHere.value ?? client.value?.paused.value ?? false);
  // The server's state event wins once it arrives, also when another tab paused or resumed.
  watch(
    () => client.value?.paused.value,
    () => {
      pausedHere.value = null;
    },
  );
  const handlers = liveHandlers(context, toast, pausedHere);
  onMounted(() => {
    if (typeof EventSource === 'undefined' && open === openSource) {
      return;
    }
    client.value = connectLive({
      url: api.events,
      open,
      handlers,
    });
  });
  onBeforeUnmount(() => client.value?.close());
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
