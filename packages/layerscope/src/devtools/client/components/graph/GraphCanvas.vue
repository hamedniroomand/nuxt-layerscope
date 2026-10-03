<script setup lang="ts">
  import { computed, ref, useTemplateRef } from 'vue';

  import { plural } from '#src/devtools/client/lib/format.ts';
  import type {
    Direction,
    GraphSelection,
    LaidOutGraph,
  } from '#src/devtools/client/lib/graph-model.ts';
  import {
    edgesOf,
    markerFor,
    nearestNode,
    strokeWidth,
  } from '#src/devtools/client/lib/graph-model.ts';
  import { usePanZoom } from '#src/devtools/client/lib/pan-zoom.ts';
  import type { GraphEdgeView, GraphView } from '#src/devtools/protocol.ts';
  import { NODE_HEIGHT, NODE_WIDTH } from '#src/graph/layout-size.ts';

  /** Two chevron sizes, so the arrowhead stays in proportion to thin and thick lines. */
  const ARROWS = [
    { id: 'ls-arrow', size: 10, stroke: 1.75 },
    { id: 'ls-arrow-lg', size: 14, stroke: 2 },
  ] as const;

  const props = defineProps<{
    view: LaidOutGraph;
    edges: GraphEdgeView[];
    selection: GraphSelection;
    /** The Overview's copy: no pan, zoom or keyboard moves. */
    still?: boolean;
  }>();
  const emit = defineEmits<{ select: [selection: GraphSelection] }>();

  const svg = useTemplateRef<SVGSVGElement>('svg');
  const pan = usePanZoom();
  const chosen = ref(props.view.layout.nodes[0]?.id ?? '');
  // A new revision can drop the focused layer; then the first node takes the tab stop.
  const focused = computed({
    get: () =>
      props.view.layout.nodes.some(node => node.id === chosen.value)
        ? chosen.value
        : (props.view.layout.nodes[0]?.id ?? ''),
    set: (id: string) => {
      chosen.value = id;
    },
  });
  const shown = computed(() => new Set(props.edges.map(edge => `${edge.from}\0${edge.to}`)));
  const laidOut = computed(() =>
    props.view.layout.edges.flatMap(path => {
      const edge = props.edges.find(item => item.from === path.from && item.to === path.to);
      return edge === undefined || !shown.value.has(`${edge.from}\0${edge.to}`)
        ? []
        : [{ path, edge }];
    }),
  );
  const nodeOf = (id: string): GraphView['nodes'][number] | undefined =>
    props.view.nodes.find(node => node.id === id);
  const isSelectedEdge = (edge: GraphEdgeView): boolean =>
    props.selection?.kind === 'edge' &&
    props.selection.from === edge.from &&
    props.selection.to === edge.to;

  // Hover and focus dim the other edges by toggling classes on the DOM: no re-render.
  const highlight = (id: string | null): void => {
    const root = svg.value;
    if (root === null) {
      return;
    }
    root.classList.toggle('dimmed', id !== null);
    for (const element of root.querySelectorAll<SVGGElement>('.edge')) {
      element.classList.toggle('hot', element.dataset.from === id || element.dataset.to === id);
    }
  };
  const KEYS: Record<string, Direction> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
  };
  const onNodeKey = (event: KeyboardEvent, id: string): void => {
    const direction = KEYS[event.key];
    if (direction !== undefined) {
      event.preventDefault();
      const next = nearestNode(props.view.layout.nodes, id, direction);
      if (next !== null) {
        focused.value = next;
        svg.value?.querySelector<SVGGElement>(`.node[data-id="${CSS.escape(next)}"]`)?.focus();
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      emit('select', { kind: 'node', layer: id });
    } else if (event.key === 'e') {
      const own = edgesOf(props.edges, id);
      const current = own.findIndex(edge => isSelectedEdge(edge));
      const next = own[(current + 1) % Math.max(1, own.length)];
      if (next !== undefined) {
        emit('select', { kind: 'edge', from: next.from, to: next.to });
      }
    }
  };
  defineExpose({ zoom: pan.zoom, fit: pan.fit });
</script>

<template>
  <svg
    ref="svg"
    class="canvas"
    :class="{ still }"
    :viewBox="`0 0 ${view.layout.width} ${view.layout.height}`"
    role="group"
    :aria-label="`Layer graph: ${view.nodes.length} layers, ${edges.length} dependencies, ${edges.filter(edge => edge.violations > 0).length} with violations`"
    @wheel="still ? undefined : pan.onWheel($event)"
    @pointerdown="still ? undefined : pan.onPointerDown($event)"
    @pointermove="pan.onPointerMove"
    @pointerup="pan.onPointerUp"
  >
    <defs>
      <!-- Open chevrons; context-stroke gives them the color of their line, also in forced colors. -->
      <marker
        v-for="arrow in ARROWS"
        :id="arrow.id"
        :key="arrow.id"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerUnits="userSpaceOnUse"
        :markerWidth="arrow.size"
        :markerHeight="arrow.size"
        orient="auto-start-reverse"
      >
        <path
          d="M2 2 L8 5 L2 8"
          fill="none"
          stroke="context-stroke"
          :stroke-width="arrow.stroke"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </marker>
    </defs>
    <g :transform="still ? undefined : pan.transform.value">
      <g
        v-for="{ path, edge } in laidOut"
        :key="`${edge.from}:${edge.to}`"
        class="edge"
        :class="{ viol: edge.violations > 0, sel: isSelectedEdge(edge), back: path.reversed }"
        :data-from="edge.from"
        :data-to="edge.to"
        @click="emit('select', { kind: 'edge', from: edge.from, to: edge.to })"
      >
        <title>
          {{ edge.from }} → {{ edge.to }}: {{ edge.count }} references, {{ edge.status
          }}{{ edge.violations > 0 ? `, ${edge.violations} findings` : '' }}
        </title>
        <path
          class="hit"
          :d="path.path"
        />
        <path
          v-if="isSelectedEdge(edge)"
          class="halo"
          :d="path.path"
          :stroke-width="strokeWidth(edge.count) + 8"
        />
        <path
          class="line"
          :d="path.path"
          :stroke-width="strokeWidth(edge.count)"
          :marker-end="`url(#${markerFor(strokeWidth(edge.count))})`"
        />
        <text
          :x="path.labelX"
          :y="path.labelY"
          text-anchor="middle"
        >
          {{ edge.violations > 0 ? `!${edge.violations}` : edge.count }}
        </text>
      </g>
      <g
        v-for="node in view.layout.nodes"
        :key="node.id"
        class="node"
        :class="{ sel: selection?.kind === 'node' && selection.layer === node.id }"
        :data-id="node.id"
        :transform="`translate(${node.x} ${node.y})`"
        role="button"
        :tabindex="still ? -1 : focused === node.id ? 0 : -1"
        :aria-label="`Layer ${node.id}, ${plural(nodeOf(node.id)?.files ?? 0, 'file')}`"
        @click="emit('select', { kind: 'node', layer: node.id })"
        @keydown="onNodeKey($event, node.id)"
        @mouseenter="highlight(node.id)"
        @mouseleave="highlight(null)"
        @focus="highlight(node.id)"
        @blur="highlight(null)"
      >
        <rect
          :width="NODE_WIDTH"
          :height="NODE_HEIGHT"
          rx="4"
        />
        <text
          :x="NODE_WIDTH / 2"
          y="17"
          text-anchor="middle"
        >
          {{ node.id }}
        </text>
        <text
          class="sub"
          :x="NODE_WIDTH / 2"
          y="31"
          text-anchor="middle"
        >
          {{ plural(nodeOf(node.id)?.files ?? 0, 'file') }}
        </text>
      </g>
    </g>
  </svg>
</template>

<style scoped>
  .canvas {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 160px;
    font: var(--font);
    touch-action: none;
    cursor: grab;
  }

  .canvas.still {
    cursor: default;
    height: auto;
    max-height: 220px;
  }

  .node {
    cursor: pointer;
    outline: none;
  }

  .node rect {
    fill: var(--bg-raised);
    stroke: var(--line);
  }

  .node:hover rect,
  .node:focus-visible rect,
  .node.sel rect {
    stroke: var(--accent);
    stroke-width: 1.5;
  }

  .node:focus-visible rect {
    stroke-width: 2.5;
  }

  .node text {
    fill: var(--fg);
    font-size: 12px;
  }

  .node .sub {
    fill: var(--fg-muted);
    font-size: 11px;
  }

  .edge {
    cursor: pointer;
  }

  .edge .line {
    fill: none;
    stroke: var(--fg-muted);
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .edge .hit {
    fill: none;
    stroke: transparent;
    stroke-width: 12;
  }

  .edge text {
    fill: var(--fg-muted);
    font-size: 11px;
    /* A halo in the page color keeps the count readable where it sits on its line. */
    paint-order: stroke;
    stroke: var(--bg);
    stroke-width: 3px;
  }

  .edge.viol .line {
    stroke: var(--error);
    /* Short dashes with round caps read as pills. */
    stroke-dasharray: 4 7;
  }

  .edge.viol text {
    fill: var(--error);
    font-weight: 600;
  }

  .edge.sel .line {
    stroke-width: 3;
  }

  /* The selection is a soft band under the line, so the line keeps its own color. */
  .edge .halo {
    fill: none;
    stroke: var(--accent);
    stroke-opacity: 0.28;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .dimmed .edge:not(.hot) {
    opacity: 0.25;
  }

  @media (forced-colors: active) {
    .edge .line {
      stroke: CanvasText;
    }

    .edge.viol .line {
      stroke: Highlight;
    }

    .edge .halo {
      stroke: Highlight;
      stroke-opacity: 1;
    }
  }
</style>
