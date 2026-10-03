<script setup lang="ts">
  import { computed } from 'vue';

  import { useTab } from '#src/devtools/client/lib/context.ts';
  import type { GraphSelection } from '#src/devtools/client/lib/graph-model.ts';
  import { formatSelection, laidOut } from '#src/devtools/client/lib/graph-model.ts';
  import { useViewData } from '#src/devtools/client/lib/view-data.ts';

  import GraphCanvas from './GraphCanvas.vue';

  const context = useTab();
  const { api, nav } = context;
  const graph = useViewData(context, async () => {
    const view = await api.graph();
    return view;
  });
  const drawn = computed(() => laidOut(graph.data.value));
  const open = (selection: GraphSelection): void => {
    nav.go({ view: 'graph', query: nav.route.value.query, param: formatSelection(selection) });
  };
</script>

<template>
  <GraphCanvas
    v-if="drawn && drawn.nodes.length > 1"
    :view="drawn"
    :edges="drawn.edges"
    :selection="null"
    still
    @select="open"
  />
  <p
    v-else-if="graph.data.value && graph.data.value.nodes.length > 1"
    class="muted"
  >
    {{ graph.data.value.nodes.length }} layers.
    <a
      href="#/graph"
      @click.prevent="open(null)"
    >
      Open the table view
    </a>
  </p>
  <p
    v-else-if="graph.error.value"
    class="err"
  >
    {{ graph.error.value }}
  </p>
</template>
