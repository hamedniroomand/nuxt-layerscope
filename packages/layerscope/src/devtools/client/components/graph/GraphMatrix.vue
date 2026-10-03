<script setup lang="ts">
  import { computed, ref, useTemplateRef } from 'vue';

  import type { GraphSelection } from '#src/devtools/client/lib/graph-model.ts';
  import { cellShade } from '#src/devtools/client/lib/graph-model.ts';
  import type { GraphView } from '#src/devtools/protocol.ts';

  const props = defineProps<{ view: GraphView; selection: GraphSelection }>();
  const emit = defineEmits<{ select: [selection: GraphSelection] }>();

  const table = useTemplateRef<HTMLTableElement>('table');
  const active = ref({ row: 0, column: 1 });
  const layers = computed(() => props.view.matrix.layers);
  const max = computed(() =>
    Math.max(0, ...props.view.matrix.cells.flat().map(cell => cell.count)),
  );
  const isSelected = (from: string, to: string): boolean =>
    props.selection?.kind === 'edge' && props.selection.from === from && props.selection.to === to;

  const select = (row: number, column: number): void => {
    const from = layers.value[row];
    const to = layers.value[column];
    if (from !== undefined && to !== undefined && from !== to) {
      emit('select', { kind: 'edge', from, to });
    }
  };
  const MOVES: Record<string, [number, number]> = {
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
  };
  const onKey = (event: KeyboardEvent): void => {
    const move = MOVES[event.key];
    if (move !== undefined) {
      event.preventDefault();
      const last = layers.value.length - 1;
      active.value = {
        row: Math.min(last, Math.max(0, active.value.row + move[0])),
        column: Math.min(last, Math.max(0, active.value.column + move[1])),
      };
      table.value
        ?.querySelector<HTMLElement>(`[data-cell="${active.value.row}:${active.value.column}"]`)
        ?.focus();
    } else if (event.key === 'Enter') {
      select(active.value.row, active.value.column);
    }
  };
</script>

<template>
  <div class="matrix-wrap">
    <table
      ref="table"
      class="matrix num"
      role="grid"
      aria-label="References between layers: rows use columns"
      @keydown="onKey"
    >
      <thead>
        <tr>
          <th scope="col">
            <span class="sr-only">From \ to</span>
          </th>
          <th
            v-for="to in layers"
            :key="to"
            scope="col"
          >
            {{ to }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(from, row) in layers"
          :key="from"
        >
          <th scope="row">{{ from }}</th>
          <td
            v-for="(to, column) in layers"
            :key="to"
            role="gridcell"
            :data-cell="`${row}:${column}`"
            :tabindex="active.row === row && active.column === column ? 0 : -1"
            :class="[
              `c${cellShade(view.matrix.cells[row]?.[column]?.count ?? 0, max)}`,
              {
                diag: row === column,
                v: (view.matrix.cells[row]?.[column]?.violations ?? 0) > 0,
                sel: isSelected(from, to),
              },
            ]"
            :title="
              row === column
                ? from
                : `${from} → ${to}: ${view.matrix.cells[row]?.[column]?.count ?? 0} references, ${view.matrix.cells[row]?.[column]?.status ?? 'none'}`
            "
            @click="
              active = { row, column };
              select(row, column);
            "
          >
            <template v-if="row !== column && (view.matrix.cells[row]?.[column]?.count ?? 0) > 0">
              {{ view.matrix.cells[row]?.[column]?.count }}
              <span
                v-if="(view.matrix.cells[row]?.[column]?.violations ?? 0) > 0"
                class="badge"
              >
                !{{ view.matrix.cells[row]?.[column]?.violations }}
              </span>
            </template>
          </td>
        </tr>
      </tbody>
    </table>
    <p class="legend muted">
      <span><i class="c1" />few</span>
      <span><i class="c3" />many references</span>
      <span><i class="v" />breaks the rules</span>
      <span>Rows use the layers in the columns.</span>
    </p>
  </div>
</template>

<style scoped>
  .matrix-wrap {
    padding: 12px 14px;
    overflow: auto;
  }

  .matrix {
    border-collapse: collapse;
  }

  th,
  td {
    min-width: 56px;
    height: 32px;
    padding: 0 6px;
    border: 1px solid var(--line);
    text-align: center;
    white-space: nowrap;
  }

  th {
    background: var(--bg-raised);
    color: var(--fg-muted);
    font-weight: 500;
  }

  td {
    cursor: pointer;
  }

  .diag {
    background: var(--bg-raised);
    cursor: default;
  }

  .c1 {
    background: color-mix(in srgb, var(--accent) 8%, var(--bg));
  }

  .c2 {
    background: color-mix(in srgb, var(--accent) 20%, var(--bg));
  }

  .c3 {
    background: color-mix(in srgb, var(--accent) 36%, var(--bg));
  }

  .v {
    background-image: var(--hatch);
    color: var(--error);
    font-weight: 600;
  }

  .sel {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .badge {
    margin-left: 2px;
    font-size: 11px;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    margin: 10px 0 0;
  }

  .legend i {
    display: inline-block;
    width: 14px;
    height: 10px;
    margin-right: 4px;
    border: 1px solid var(--line);
    vertical-align: -1px;
  }

  @media (forced-colors: active) {
    .v {
      border: 2px solid CanvasText;
    }
  }
</style>
