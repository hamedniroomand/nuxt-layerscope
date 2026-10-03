<script setup lang="ts">
  import { useTab } from '#src/devtools/client/lib/context.ts';

  import BaselineView from './BaselineView.vue';
  import FindingsView from './FindingsView.vue';
  import LayersView from './LayersView.vue';
  import OverviewView from './OverviewView.vue';
  import TraceView from './TraceView.vue';
  import UnusedView from './UnusedView.vue';

  const { nav } = useTab();
</script>

<template>
  <OverviewView v-if="nav.route.value.view === 'overview'" />
  <FindingsView v-else-if="nav.route.value.view === 'findings'" />
  <TraceView v-else-if="nav.route.value.view === 'trace'" />
  <UnusedView v-else-if="nav.route.value.view === 'unused'" />
  <BaselineView v-else-if="nav.route.value.view === 'baseline'" />
  <LayersView v-else-if="nav.route.value.view === 'layers'" />
</template>
