<script setup lang="ts">
  import type { LiveStatus } from '#src/devtools/client/lib/live.ts';

  defineProps<{ status: LiveStatus; paused: boolean }>();
  defineEmits<{ toggle: [] }>();

  const LABELS: Record<LiveStatus, string> = {
    connecting: 'connecting',
    live: 'live',
    reconnecting: 'reconnecting',
    paused: 'paused',
    polling: 'polling',
  };
</script>

<template>
  <span
    class="live"
    :class="status"
    role="status"
  >
    <i
      v-if="status !== 'polling'"
      aria-hidden="true"
    />
    {{ LABELS[status] }}
  </span>
  <button
    type="button"
    aria-keyshortcuts="p"
    @click="$emit('toggle')"
  >
    {{ paused ? 'Resume' : 'Pause' }}
  </button>
</template>

<style scoped>
  .live {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--fg-muted);
  }

  .live i {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ok);
  }

  .live.reconnecting i,
  .live.connecting i {
    background: var(--warn);
  }

  .live.paused i {
    background: var(--fg-muted);
  }

  @media (forced-colors: active) {
    .live i {
      border: 1px solid CanvasText;
    }
  }
</style>
