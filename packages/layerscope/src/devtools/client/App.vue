<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue';

  import AppHeader from './components/AppHeader.vue';
  import TabBar from './components/TabBar.vue';
  import ToastBar from './components/ToastBar.vue';
  import { useAppShortcuts } from './lib/app.ts';
  import { useTab } from './lib/context.ts';
  import { duration } from './lib/format.ts';
  import FindingsView from './views/FindingsView.vue';
  import LayersView from './views/LayersView.vue';
  import OverviewView from './views/OverviewView.vue';

  const context = useTab();
  const { store, nav } = context;
  const toast = ref<string | null>(null);
  const tabs = computed(() => [
    { view: 'overview' as const, label: 'Overview' },
    {
      view: 'findings' as const,
      label: 'Findings',
      badge: store.state.data?.report.findings.length,
    },
    { view: 'layers' as const, label: 'Layers' },
  ]);

  useAppShortcuts(context, {
    views: ['overview', 'findings', 'layers'],
    escape: () => {
      toast.value = null;
      (document.activeElement as HTMLElement | null)?.blur();
    },
  });
  watch(
    () => store.state.running,
    (running, was) => {
      if (was && !running && store.state.data && store.state.error === null) {
        toast.value = `Re-run finished in ${duration(store.state.data.durationMs)}`;
      }
    },
  );
  onMounted(() => store.load());
</script>

<template>
  <div class="app">
    <AppHeader />
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
      <template v-else>
        <OverviewView v-if="nav.route.value.view === 'overview'" />
        <FindingsView v-else-if="nav.route.value.view === 'findings'" />
        <LayersView v-else-if="nav.route.value.view === 'layers'" />
      </template>
    </main>
    <ToastBar
      :message="toast"
      @dismiss="toast = null"
    />
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
