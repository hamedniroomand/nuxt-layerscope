<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, useTemplateRef } from 'vue';

  import GraphCanvas from '#src/devtools/client/components/graph/GraphCanvas.vue';
  import GraphMatrix from '#src/devtools/client/components/graph/GraphMatrix.vue';
  import GraphPanel from '#src/devtools/client/components/graph/GraphPanel.vue';
  import { useTab } from '#src/devtools/client/lib/context.ts';
  import type { GraphSelection } from '#src/devtools/client/lib/graph-model.ts';
  import {
    formatSelection,
    parseSelection,
    TABLE_DEFAULT_ABOVE,
    visibleEdges,
  } from '#src/devtools/client/lib/graph-model.ts';
  import { useViewData } from '#src/devtools/client/lib/view-data.ts';

  const context = useTab();
  const { api, nav, shortcuts } = context;
  const graph = useViewData(context, async () => {
    const view = await api.graph();
    return view;
  });
  const canvas = useTemplateRef<{ zoom: (factor: number) => void; fit: () => void }>('canvas');
  const violationsOnly = ref(false);
  const minCount = ref(1);
  const chosenMode = ref<'graph' | 'table' | null>(null);
  const mode = computed(
    () =>
      chosenMode.value ??
      ((graph.data.value?.nodes.length ?? 0) > TABLE_DEFAULT_ABOVE ? 'table' : 'graph'),
  );
  const selection = computed(() => parseSelection(nav.route.value.param));
  const edges = computed(() =>
    graph.data.value === null
      ? []
      : visibleEdges(graph.data.value, {
          violationsOnly: violationsOnly.value,
          minCount: minCount.value,
        }),
  );
  const select = (next: GraphSelection): void => {
    nav.go({ view: 'graph', query: nav.route.value.query, param: formatSelection(next) });
  };
  onBeforeUnmount(
    shortcuts.register({
      key: 'Escape',
      label: 'Clear the selection',
      inFields: true,
      run: () => {
        // In a field, Esc only leaves the field; a second Esc clears the selection.
        const active = document.activeElement;
        if (active instanceof HTMLInputElement || active instanceof HTMLSelectElement) {
          active.blur();
          return;
        }
        select(null);
      },
    }),
  );
</script>

<template>
  <section
    class="graph"
    :class="{ open: selection !== null }"
  >
    <div class="tools">
      <label>
        <input
          v-model="violationsOnly"
          type="checkbox"
        />
        Violations only
      </label>
      <label>
        Hide edges under
        <select v-model.number="minCount">
          <option :value="1">1</option>
          <option :value="2">2</option>
          <option :value="5">5</option>
          <option :value="10">10</option>
        </select>
        references
      </label>
      <span
        class="seg"
        role="group"
        aria-label="View"
      >
        <button
          type="button"
          :aria-pressed="mode === 'graph'"
          @click="chosenMode = 'graph'"
        >
          Graph
        </button>
        <button
          type="button"
          :aria-pressed="mode === 'table'"
          @click="chosenMode = 'table'"
        >
          Table
        </button>
      </span>
      <template v-if="mode === 'graph'">
        <button
          type="button"
          aria-label="Zoom in"
          @click="canvas?.zoom(1.25)"
        >
          ⊕
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          @click="canvas?.zoom(0.8)"
        >
          ⊖
        </button>
        <button
          type="button"
          @click="canvas?.fit()"
        >
          Fit
        </button>
      </template>
    </div>
    <p
      v-if="graph.error.value"
      class="err message"
      role="alert"
    >
      {{ graph.error.value }}
      <button
        type="button"
        @click="graph.reload()"
      >
        Retry
      </button>
    </p>
    <p
      v-else-if="graph.data.value && graph.data.value.nodes.length < 2"
      class="muted message"
    >
      The graph needs at least two layers.
      <a
        href="https://layerscope.kitdev.space/guide/layers"
        target="_blank"
        rel="noopener"
      >
        How layers are found
      </a>
    </p>
    <template v-else-if="graph.data.value">
      <div class="body">
        <GraphCanvas
          v-if="mode === 'graph'"
          ref="canvas"
          :view="graph.data.value"
          :edges="edges"
          :selection="selection"
          @select="select"
        />
        <GraphMatrix
          v-else
          :view="graph.data.value"
          :selection="selection"
          @select="select"
        />
      </div>
      <GraphPanel
        v-if="selection"
        :view="graph.data.value"
        :selection="selection"
        @close="select(null)"
      />
    </template>
    <div
      class="sr-only"
      aria-live="polite"
    >
      {{
        selection?.kind === 'node'
          ? `Selected layer ${selection.layer}`
          : selection?.kind === 'edge'
            ? `Selected ${selection.from} to ${selection.to}`
            : ''
      }}
    </div>
  </section>
</template>

<style scoped>
  .graph {
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    height: 100%;
  }

  .graph.open {
    grid-template-columns: 1fr 320px;
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    grid-column: 1 / -1;
    padding: 8px 14px;
    border-bottom: 1px solid var(--line);
  }

  .seg {
    display: inline-flex;
  }

  .seg button {
    border-radius: 0;
  }

  .seg button[aria-pressed='true'] {
    background: var(--bg-raised);
    color: var(--accent);
  }

  .body {
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }

  .message {
    grid-column: 1 / -1;
    padding: 0 14px;
  }

  @media (max-width: 900px) {
    .graph.open {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr 40%;
    }
  }
</style>
