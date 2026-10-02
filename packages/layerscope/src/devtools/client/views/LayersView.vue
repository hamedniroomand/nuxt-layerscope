<script setup lang="ts">
  import { computed } from 'vue';

  import LayersTable from '#src/devtools/client/components/LayersTable.vue';
  import { useTab } from '#src/devtools/client/lib/context.ts';

  const { store } = useTab();
  const layers = computed(() => store.state.data?.report.layerStats ?? []);
</script>

<template>
  <section class="layers-view">
    <LayersTable :layers="layers" />
    <p class="muted">
      Refs count references that cross into or out of a layer. A layer without an
      <code>allow</code> list may depend on any layer.
    </p>
  </section>
</template>

<style scoped>
  .layers-view {
    padding: 10px 14px;
  }
</style>
