<script setup lang="ts">
  import { useTab } from '#src/devtools/client/lib/context.ts';
  import type { GraphSelection } from '#src/devtools/client/lib/graph-model.ts';
  import { formatSelection } from '#src/devtools/client/lib/graph-model.ts';
  import { useViewData } from '#src/devtools/client/lib/view-data.ts';

  import GraphCanvas from './GraphCanvas.vue';

  const context = useTab();
  const { api, nav } = context;
  const graph = useViewData(context, async () => {
    const view = await api.graph();
    return view;
  });
  const open = (selection: GraphSelection): void => {
    nav.go({ view: 'graph', query: nav.route.value.query, param: formatSelection(selection) });
  };
</script>

<template>
  <GraphCanvas
    v-if="graph.data.value && graph.data.value.nodes.length > 1"
    :view="graph.data.value"
    :edges="graph.data.value.edges"
    :selection="null"
    still
    @select="open"
  />
  <p
    v-else-if="graph.error.value"
    class="err"
  >
    {{ graph.error.value }}
  </p>
</template>
