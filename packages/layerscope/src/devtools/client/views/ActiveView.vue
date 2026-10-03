<script setup lang="ts">
  import { defineAsyncComponent } from 'vue';

  import { useTab } from '#src/devtools/client/lib/context.ts';

  import BaselineView from './BaselineView.vue';
  import FindingsView from './FindingsView.vue';
  import OverviewView from './OverviewView.vue';
  import TraceView from './TraceView.vue';
  import UnusedView from './UnusedView.vue';

  // The graph is a chunk of its own, loaded when the Graph view or the Overview first needs it.
  const GraphView = defineAsyncComponent(async () => {
    const chunk = await import('#src/devtools/client/graph.ts');
    return chunk.GraphView;
  });
  const { nav } = useTab();
</script>

<template>
  <OverviewView v-if="nav.route.value.view === 'overview'" />
  <FindingsView v-else-if="nav.route.value.view === 'findings'" />
  <TraceView v-else-if="nav.route.value.view === 'trace'" />
  <UnusedView v-else-if="nav.route.value.view === 'unused'" />
  <BaselineView v-else-if="nav.route.value.view === 'baseline'" />
  <GraphView v-else-if="nav.route.value.view === 'graph'" />
</template>
