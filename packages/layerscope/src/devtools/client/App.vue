<script setup lang="ts">
  import { computed, onMounted, watch } from 'vue';

  import AppHeader from './components/AppHeader.vue';
  import LiveStatus from './components/LiveStatus.vue';
  import TabBar from './components/TabBar.vue';
  import ToastBar from './components/ToastBar.vue';
  import { useAppShortcuts } from './lib/app.ts';
  import { useTab } from './lib/context.ts';
  import { duration } from './lib/format.ts';
  import { useLive } from './lib/live-view.ts';
  import ActiveView from './views/ActiveView.vue';

  const context = useTab();
  const { store, nav } = context;
  const { toast } = context;
  const live = useLive(context, toast);
  const tabs = computed(() => {
    const report = store.state.data?.report;
    return [
      { view: 'overview' as const, label: 'Overview' },
      { view: 'findings' as const, label: 'Findings', badge: report?.findings.length },
      { view: 'trace' as const, label: 'Trace' },
      { view: 'unused' as const, label: 'Unused' },
      { view: 'graph' as const, label: 'Graph' },
      { view: 'baseline' as const, label: 'Baseline', badge: report?.baseline?.suppressed.length },
    ];
  });

  useAppShortcuts(context, {
    views: ['overview', 'findings', 'trace', 'unused', 'graph', 'baseline'],
    escape: () => {
      toast.value = null;
      (document.activeElement as HTMLElement | null)?.blur();
    },
  });
  watch(
    () => store.state.running,
    (running, was) => {
      if (was && !running && store.state.data && store.state.error === null) {
        toast.value = {
          message: `Re-run finished in ${duration(store.state.data.durationMs)}`,
          showsNew: false,
        };
      }
    },
  );
  // The Undo in the toast lasts 10 s; the Baseline view keeps one until the next write.
  const UNDO_MS = 10_000;
  watch(toast, shown => {
    if (shown?.undo !== undefined) {
      setTimeout(() => {
        if (toast.value === shown) {
          toast.value = { ...shown, undo: undefined };
        }
      }, UNDO_MS);
    }
  });
  onMounted(() => store.load());
</script>

<template>
  <div class="app">
    <AppHeader>
      <template
        v-if="live.status.value"
        #live
      >
        <LiveStatus
          :status="live.status.value"
          :paused="live.paused.value"
          @toggle="live.togglePause()"
        />
      </template>
    </AppHeader>
    <TabBar :tabs="tabs" />
    <div
      v-if="store.state.unreachable"
      class="banner"
      role="alert"
    >
      The dev server does not answer. The last data stays visible.
      <button
        type="button"
        @click="store.load()"
      >
        Retry
      </button>
    </div>
    <main class="body">
      <div
        v-if="store.state.error"
        class="failure"
        role="alert"
      >
        <p>The analysis failed: {{ store.state.error }}</p>
        <button
          type="button"
          @click="store.rerun()"
        >
          Retry
        </button>
      </div>
      <p
        v-else-if="!store.state.data"
        class="loading muted"
      >
        Analyzing…
      </p>
      <ActiveView v-else />
    </main>
    <ToastBar
      :message="toast?.message ?? null"
      @dismiss="toast = null"
    >
      <button
        v-if="toast?.undo !== undefined"
        type="button"
        @click="context.actions.undo()"
      >
        Undo
      </button>
      <template v-if="toast?.showsNew">
        <button
          type="button"
          @click="nav.open('findings', { onlyNew: true })"
        >
          Show new
        </button>
        <button
          type="button"
          @click="live.resetMarker()"
        >
          Reset marker
        </button>
      </template>
    </ToastBar>
  </div>
</template>

<style scoped>
  .app {
    display: grid;
    grid-template-rows: auto auto auto 1fr auto;
    height: 100%;
  }

  .body {
    min-height: 0;
    overflow: auto;
  }

  .banner,
  .failure {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--line);
    color: var(--warn);
  }

  .failure {
    color: var(--error);
  }

  .failure p {
    margin: 0;
  }

  .loading {
    padding: 12px 14px;
  }
</style>
