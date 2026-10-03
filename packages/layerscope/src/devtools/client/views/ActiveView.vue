<script setup lang="ts">
  import { useTab } from '#src/devtools/client/lib/context.ts';

  import FindingsView from './FindingsView.vue';
  import LayersView from './LayersView.vue';
  import OverviewView from './OverviewView.vue';

  const { nav } = useTab();
</script>

<template>
  <OverviewView v-if="nav.route.value.view === 'overview'" />
  <FindingsView v-else-if="nav.route.value.view === 'findings'" />
  <LayersView v-else-if="nav.route.value.view === 'layers'" />
</template>
